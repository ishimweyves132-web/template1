# Architecture

## Choice
An **installable, offline-first web app (PWA)**: React + TypeScript + Vite, no backend, no account, no runtime
dependency other than React (~96 kB gzipped total). It installs on Android from Chrome ("Add to Home screen"),
opens in its own window, and runs with the network off.

Why not a native/SQLite app? The existing repo is an unrelated web project (a septic-company site with a server),
so there was no mobile project to extend. A PWA is the lightest thing that meets the brief (small install, fast start,
no store, no server). The trade-off is reminders (see below). If you later want guaranteed background notifications,
wrap `dist/` with Capacitor + `@capacitor/local-notifications`; the data and logic layers do not change.

**Storage:** IndexedDB, not SQLite. Browsers have no built-in SQLite; shipping one means a WASM build (~1 MB) and
manual persistence. The data here is small, keyed and range-queried by date, which IndexedDB does natively and
transactionally. All derived numbers are computed in memory from the records (thousands of rows take milliseconds).

## Layers
```
src/lib/      pure logic, no React        <- unit-tested
  dates.ts      local-date arithmetic (UTC maths, DST-safe)
  model.ts      types, activities, default 80-min routine
  stats.ts      ledger, day evaluation, streaks, periods, bars
  weakness.ts   neglect / decline / pause observations
  challenge.ts  30-day plan + status (never auto-resets)
  goals.ts      goal progress, derived badges, records, next milestone
  db.ts         IndexedDB wrapper (one all-or-nothing replace transaction)
  backup.ts     export / validate / merge / replace / snapshots
  dict.ts       dictionary pack: manifest, verified resumable download, install, search
  reminders.ts  due-check + notification
src/store.tsx   React context: loads records, writes through to the DB
src/views/      screens (Today, Track, Focus, Progress, More, Challenge, Goals, Vocab, Dictionary, Data, Reminders)
src/sw.js       service worker (precache of the exact built files, versioned by content hash)
tools/          build-pack.mjs (dictionary builder), make-icons.cjs
```

## Data model (IndexedDB `french-mastery-tracker`)
| store | contents |
|---|---|
| `sessions` | `{id, date, activity, minutes, learned, difficulties, notes, source}`: the only source of truth for time |
| `marks` | "I marked this activity done for this date" (does not change minutes) |
| `vocab` | personal words: fr, en, example, notes, addedAt, status, `reviews[]` dates |
| `goals`, `challenges` | user goals; challenge runs (old runs are archived, not deleted) |
| `kv` | settings: target history, reminders, running timer, dictionary meta |
| `snapshots` | last 5 safety copies |
| `dict`, `partial` | installed dictionary entries (index on normalised headword); in-progress download |

Design rules that protect integrity:
* **Nothing is stored for a missed day.** "Missed" is derived (a tracked day with no minutes), so history can never be
  deleted or fabricated by missing a day. Days before your first record are "before tracking", not "missed".
* **Partial completion is native:** you record minutes; status is `done` (>= target or marked), `partial`, or `missed`.
* **Targets are versioned by date:** changing a target applies from today; past days keep the target they had.
* **Statistics are computed, never stored**, so they cannot drift from the records.
* **Time completion** = sum of min(achieved, target) / sum of targets, so 60 min of listening cannot hide a neglected activity.
  (Total study time shown separately is uncapped.)
* **Badges are derived** from the records (sustained effort only) and show the date the threshold was crossed.
* **Writes** are single-transaction. Restore-replace is one transaction across all stores. Every import, erase and
  safety-restore first takes a snapshot. A weekly automatic snapshot is kept in-app.

## Offline
The service worker precaches every built file at install. Navigation falls back to the cached `index.html`.
Only the optional dictionary download touches the network, and it is never cached by the worker.

## Reminders: honest limitation
Web apps cannot schedule notifications for when they are closed on Android (the Notification Triggers API was never
shipped). The reminder therefore fires when the app is opened or in the background after the chosen time, and also shows
as a banner on Today. It is sent at most once a day and never if you already practised. For true background reminders: Capacitor.

## Performance
No framework beyond React, hand-written SVG charts, no chart library, one CSS file. Statistics for 3 years of data
(about 3,300 sessions) render in well under a second even with a 6x CPU slowdown (see README test results).

## Visual design
White base with a few static, soft colour glows behind frosted-glass cards (`backdrop-filter`), a floating glass nav and a blurred sheet scrim.
One light theme; every text colour is at least 4.5:1 on white. Glass is only a layer on top of solid readable colours, with a solid-white fallback
where `backdrop-filter` is unsupported or `prefers-reduced-transparency` is set. Glows are static (no animation). Caveat: blur is GPU-composited, and the
performance figures in the README were measured with CPU throttling in headless Chromium, which does not reproduce a real low-end phone GPU. If a very old device
stutters, the CSS variable block at the top of `styles.css` is the single place to reduce blur radii.

## Spaced review and playbook
`lib/review.ts` schedules saved words at 1, 3, 7, 14, 30 and 60 days after the last review (learned words are not scheduled). `lib/boost.ts` picks
"today's boost" from the user's own records: "never miss twice" after a missed day, otherwise the activity with the lowest share of its target.
