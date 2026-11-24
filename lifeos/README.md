# LifeOS

Design your life. Live with intention. A personal life-planning and execution system that runs on **phone and computer** from one codebase, works **offline**, and stores everything **on your device**.

Vision → four-year goals → annual / quarterly / monthly objectives → measurable key results → tasks → scheduled sessions → what actually happened → evaluation.

## Run
```
cd lifeos && npm install
npm run dev        # development
npm run build      # type-check + production build -> dist/
npm test           # unit tests (domain engine, persistence, AI guard, ICS)
npm run build && npm run e2e   # real Chromium: phone + desktop, offline, restart, backup, mock AI gateway
```
Host `dist/` on any static HTTPS host. Open it in Chrome/Edge/Safari, then **Install app** (phone: "Add to Home screen"; desktop: the install icon in the address bar).
GitHub Pages: repo Settings → Pages → Source: *GitHub Actions*, then run the **LifeOS web** workflow.

## What is built (status is honest; see docs/DESIGN.md)
| Phase | Scope | Status |
|---|---|---|
| 1 Foundation + planning | vision, areas, goals at 5 levels, key results (up/down/binary), measurements, tasks, recurrence, local database, backup/restore | built and tested |
| 2 Daily execution | Today screen, priorities with goal trail, completion with actual time (done/partly/skipped), focus timer, habits, daily review, evidence | built and tested |
| 3 Scheduling | deterministic scheduler, rules, proposals you approve, automatic rescheduling inside the rules, undo, audit, ICS import/export | built and tested |
| 4 Evaluation | execution, consistency, outcome, evidence kept separate; weekly/monthly reviews; Life Ledger | built and tested |
| 5 Intelligence | rule-based coach; optional AI gateway whose answers are validated before anything can change | built and tested (the AI path only against a mock gateway) |
| 6 Reliability | offline service worker, safety copies, accessibility checks, light/dark, responsive layouts | built and tested |
| 7 Attachments, Gemini, in-app calendar | evidence files stored on the device (optional in backups); your own Gemini API key pasted in Settings (encrypted on the device, never in backups); AI can suggest tasks, schedules and sub-goals (all validated, drafts need your approval); edit/delete commitments, move or unschedule sessions, conflict warnings | built and tested (Gemini only against a mocked API) |
| Not built | native Android (Google Calendar API, device calendar, exact alarms, background reminders), encrypted cloud backup, multi-time-zone travel | planned |

## Limits you should know
* **External calendars** connect through `.ics` files (import and export). Direct Google Calendar / Android device-calendar sync needs the native Android app and OAuth, which is not built.
* **Reminders** work while the app is open or in the background; a web app cannot schedule notifications for when it is closed.
* **AI**: no model or key ships with LifeOS. Paste your own Gemini API key in Settings (or connect your own gateway). The key is sent only to Google. I verified the endpoint accepts browser requests with the key in a header, but I could not run a real Gemini request without your key; everything else is tested against a mock. The coach itself is rule-based.
* **Attachments** are stored on this device, up to 10 MB each, and are included in a backup only if you tick the option. Programs, scripts and web pages are refused.
* **Calendar**: LifeOS uses its own calendar (plus .ics import/export).
* Times are stored as local wall-clock times; travelling across time zones is not adjusted.
