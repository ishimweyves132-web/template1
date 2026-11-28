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

## Install on your phone and computer
Open the repository's **Releases** page and pick the newest release whose name starts with **LifeOS** (tag `lifeos-v1.0.N`). Each one contains:
| Device | File | How |
|---|---|---|
| Android phone | `LifeOS-1.0.N.apk` | Download it on the phone, open it, allow "install unknown apps" for your browser/files app. Play Protect may warn because the app is not from the Play Store: choose *Install anyway*. Without a fixed signing key (see below) each build is signed differently, so uninstall the old version first (export a backup first!). |
| Windows PC | `LifeOS-Setup-1.0.N.exe` (installer) or `LifeOS-Portable-1.0.N.exe` (no install) | Windows SmartScreen will say the publisher is unknown because the app is not code-signed: *More info* then *Run anyway*. |
| Linux PC | `LifeOS-1.0.N-x86_64.AppImage` | `chmod +x` it and run it. |
Your data stays on the device you use. Use Settings → Export backup to move it between devices.

**Fixed Android signing key (optional):** add the repository secrets `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (and optionally `ANDROID_KEY_PASSWORD`); builds then install over each other with data kept.

## Tell LifeOS, it does the rest
Today opens with one box: **Tell LifeOS**. Type or speak (🎙, where your browser supports speech) anything, in one sentence or a whole paragraph. Examples:
- *"I want to speak French at B2 in two years, run a 10 km race by spring, and read 20 minutes every evening."*
- *"Next month I'm moving house. Keep my training going and plan around it."*
- *"I finished my 5 km run and read 30 pages."*

The assistant turns that into the right goals at the right horizons, measurable key results, repeating tasks, habits and a calendar for the coming weeks, and it records what you report doing. **Plan it for me** places any unscheduled work for today. Every request shows what it changed, with an **Undo this request** button.

Horizons are not fixed: a long-term goal can end in 2, 5, 10 or 20 years. Older four-year goals are converted automatically.

## The assistant
Assistant tab: you talk to it in plain words and it **does the work itself**. It receives your complete data (goals, key results, tasks, calendar, sessions, habits, history, evidence text, rules) and has tools to create/edit/archive objectives, key results and measurements, tasks (incl. repeating), schedule/unschedule sessions, plan a whole period with the deterministic scheduler, add commitments, log habits, record completion, save reviews and adjust scheduling rules. There is no approval step. Safety instead comes from: strict validation of every tool call (bad calls are returned to the model to fix), nothing is ever deleted (cancel/archive only), a cap of 8 rounds / 40 actions per request, and an **Undo this request** button that restores every touched record exactly. It needs your Gemini key and an explicit consent switch (Settings or the Assistant tab). Attached files are never sent.

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
| 9 Tell-LifeOS capture, any horizon | one capture box on Today with speech input; the assistant infers details, sets long-term goals (any span), breaks them down to weekly steps, records reported activity; delete wrong key results and stop habits (undoable) | built and tested with a stand-in model; not run against live Gemini |
| 8 Autonomous assistant, native apps | assistant with tool calling that acts directly + exact undo; Android APK (real notifications with the app closed, share-sheet backups); Windows and Linux desktop apps; one release workflow | built; see limits below |
| Not built | Google Calendar API / device-calendar sync, encrypted cloud backup, multi-time-zone travel | planned |

## Limits you should know
* **External calendars** connect through `.ics` files (import and export). Direct Google Calendar / Android device-calendar sync needs the native Android app and OAuth, which is not built.
* **Reminders**: in the Android app they are real scheduled notifications (re-planned whenever your plan changes; Android may delay them to save battery). In the browser and desktop app they appear while LifeOS is open or in the tray.
* **What was and was not verified**: the web app, the assistant logic (98 unit tests, 21 browser tests with a mocked Gemini) and the desktop app launching under Electron were run for real. The Android APK is built in CI but **has not been run on a phone**, and Windows/Linux builds are launched in CI only for a start-up check. The assistant has **never been run against the real Gemini service** (no key available while building): if a model replies unexpectedly, the action list in the chat shows exactly what happened and Undo reverts it.
* The desktop app only allows connections to Google Gemini, so a custom AI gateway works only in the browser/Android versions.
* **AI**: no model or key ships with LifeOS. Paste your own Gemini API key in Settings. The key is encrypted on the device and sent only to Google, and your data goes to Google while the assistant is used (check your Google plan's terms). The rule-based coach works without AI.
* **Attachments** are stored on this device, up to 10 MB each, and are included in a backup only if you tick the option. Programs, scripts and web pages are refused.
* **Calendar**: LifeOS uses its own calendar (plus .ics import/export).
* Times are stored as local wall-clock times; travelling across time zones is not adjusted.
