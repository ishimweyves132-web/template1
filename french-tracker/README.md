# French Mastery Tracker

A personal, offline-first tracker for your French routine: log what you actually did, see where you are consistent,
and see exactly what you are neglecting. Not an AI tutor; no account, no server, no AI, no tracking.

* Today dashboard · Track (timer or manual minutes, targets, notes) · Focus (neglect tracker) · Progress (stats, comparison, calendar heatmap)
* 30-day challenge · Goals, badges, records · Vocabulary with review tracking · Optional offline dictionary · Reminders · Export / import / safety copies

Docs: [Architecture](docs/ARCHITECTURE.md) · [Dictionary](docs/DICTIONARY.md)

## Run
```
cd french-tracker
npm install
npm run dev        # development
npm run build      # type-check + production build -> dist/
npm run preview    # serve dist/ on :4173
```
Host `dist/` on any static host (GitHub Pages, Netlify, Cloudflare Pages, Lovable publish). Open it once on your
Android phone in Chrome, then menu -> **Install app**. After that it works with airplane mode on. Use HTTPS (or localhost): required for the service worker.

## Tests
```
npm test           # 57 unit/integration tests (logic, IndexedDB, backup, dictionary download over real HTTP)
npm run build && npm run e2e   # real Chromium, phone viewport, real service worker + offline + restart + perf
```
