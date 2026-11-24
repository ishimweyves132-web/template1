# LifeOS design and architecture

## Decisions that differ from the original brief (and why)
* **Web app (PWA) instead of native Kotlin.** The requirement became "phone and computer". One TypeScript codebase installs on both and works offline. A native Android wrapper (Capacitor) can reuse everything later; the Android-only integrations (Google Calendar API, CalendarContract, exact alarms) are the reason to do that, and are listed as not built.
* **IndexedDB instead of Room/SQLite.** Same role: transactional local source of truth. All multi-record changes use one atomic transaction (verified: a bad record aborts the whole write).
* **Objectives are one hierarchy with a `level`** (four-year, annual, quarterly, monthly, weekly) instead of separate goal/milestone tables. A task can attach to any level or to none.

## Principles (each is enforced in code and covered by tests)
1. Completion is not achievement. A goal's progress comes only from its key results (increasing or decreasing targets) or its measurable children, never from task completion. Unmeasured is shown as "not measured", never 0%.
2. Planned time, scheduled time and actual time are separate records. Every completion creates a new execution record; nothing is overwritten.
3. AI proposes, deterministic code validates, the user approves, the database records. The validator (the same one used for manual moves) rejects: overlaps, buffers, working hours, working days, daily capacity, deadlines, earliest start, the past, resolved tasks, unknown tasks. A hard deny-list blocks changing the vision, goals, targets, deadlines, rules, permissions, deleting anything, marking work done, or moving calendar events. Unknown fields are stripped.
4. Automatic rescheduling happens only inside rules the user set, only for eligible tasks (not fixed, protected, recurring, completed, past deadline, or moved too often), and never changes a deadline. Every move is recorded with before/after and can be undone while it is the task's latest change.
5. No hidden fallbacks: if the scheduler cannot place something it says why ("daily capacity used", "deadline passed", "longer than any free block"); if the AI gateway fails, nothing changes and the error is shown.
6. Privacy: everything is local. The AI request contains only task ids/titles/durations/deadlines and free windows: no notes, evidence or calendar event titles (tested).

## Modules
```
src/domain  pure logic, no UI: progress, recurrence, scheduler, reschedule, ops, evaluation, coach, aiGuard, ics
src/lib     dates, model, db (IndexedDB), backup (checksummed export, restore, safety snapshots), demo data
src/store   state + atomic persistence + day rollover (create occurrences, record missed, recover)
src/views   Today, Vision, Planner, Progress, Coach, Settings + shared sheets
```

## Scheduling algorithm
Inputs: tasks, deadlines, priority, estimates, preferred time of day, calendar busy time, rules. Free time = working hours minus busy blocks plus buffers; items are ranked by deadline, then priority, then length; each is placed in the earliest valid slot (preferred window first) subject to daily capacity; unplaceable items are returned with a reason. The output is re-checked by the validator. Deterministic: same input, same output (tested), with 60 randomized rounds asserting no overlaps, hours, deadlines and capacity.

## Calendar interchange (ICS)
Import: timed events become busy time (UTC converted to local; floating and TZID taken as local wall clock); DAILY/WEEKLY repeats with INTERVAL/BYDAY/COUNT/UNTIL/EXDATE; midnight-crossing events split per day; all-day events and unsupported repeats are skipped with a reason. Re-import is idempotent (stable external ids). Export: approved sessions with stable `UID:<id>@lifeos`, so re-importing updates instead of duplicating.

## Testing evidence
Unit/integration (Vitest): progress and roll-up maths, recurrence, scheduler invariants, rescheduling policy and undo, evaluation, coach, AI guard (adversarial payloads), ICS parse/export, database atomicity, backup/restore, performance with 20k occurrences.
End to end (Chromium, phone and desktop viewports, real service worker): vision → goal chain → key result → task → partial completion with actual time → plan approval → automatic recovery and undo → protected task refusal → ICS import/export → mock AI gateway with forbidden operations → backup/erase/restore → offline use → browser restart → accessibility basics.

## Gemini, attachments and the in-app calendar (phase 7)
* **Key vault:** the pasted Gemini API key is encrypted with a non-extractable AES-GCM key kept in IndexedDB, stored outside settings, and never included in backups or safety copies (tested). It is sent only in the `x-goog-api-key` header to `generativelanguage.googleapis.com`, never in a URL, and error messages redact it. The model list comes from the key itself (`models.list`), so no model name is guessed. Google's API answers browser preflights for that header (checked live without a key).
* **AI scope:** the same validator gates every answer. New operation `propose_objective` is forced to the parent's next level, must sit inside the parent's dates, cannot duplicate a sibling, and is created only as a *draft* after approval. Requests carry no notes, evidence, files or calendar event titles.
* **Attachments:** a separate `files` store (blobs), 10 MB per file, executables/scripts/web pages refused, previews only for PNG/JPEG/WebP/GIF, optional inclusion in backups (checksum covers them; restoring a backup without attachments leaves existing ones alone).
* **Calendar:** commitments can be edited and deleted; a session can be moved (held to the same rules as the scheduler and the AI) or unscheduled; both are recorded and undoable; sessions overlapping a commitment are flagged with a one-tap re-plan. Performance was measured with 20k occurrences and 150-task plans (see tests).

## Roadmap
* **Phase 7 (native Android shell):** Capacitor wrapper; Google Calendar API with narrow OAuth scopes and CalendarContract with duplicate prevention across the two routes; exact alarms where justified; boot/time-zone reconciliation of reminders.
* **Phase 8:** encrypted cloud backup; evidence attachments; local device authentication; multi-time-zone travel; AI provider integration against a real gateway.
