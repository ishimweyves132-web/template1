# French Mastery Tracker

A personal, offline-first tracker for your French routine: log what you actually did, see where you are consistent,
and see exactly what you are neglecting. Not an AI tutor; no account, no server, no AI, no tracking.

* **Fast French** playbook (12 practical habits, with a daily boost chosen from your own records) and spaced review for saved words
* **Built-in dictionary (259 common words) and phrasebook (128 phrases)**: original content, works offline from first launch; a bigger pack is an optional download
* White glass interface (light only)
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

## Android app (APK)
The same code is wrapped with Capacitor in `android/` (app id `com.frenchmastery.tracker`). In the APK, reminders are **real scheduled Android
notifications** that work with the app closed (planned 14 days ahead, re-planned whenever you open the app or log practice), and backups are saved through
Android's share sheet (the web `download` does not work inside a WebView).

Build it on GitHub (no Android SDK needed locally): Actions tab -> **Build Android APK** -> Run workflow -> download the `french-mastery-apk` artifact.
Or locally with Android Studio / the Android SDK + JDK 21:
```
npm ci && npm run build && npx cap sync android && cd android && ./gradlew assembleDebug
# -> android/app/build/outputs/apk/debug/app-debug.apk
```
Install by opening the `.apk` on the phone (allow "install unknown apps" for the app you open it from). This is a debug-signed build, fine for personal use;
a Play Store release needs your own signing key.

**Dictionary:** the APK build also bundles a real 98,303-entry Wiktionary French-to-English dictionary (see `docs/DICTIONARY.md`), installed offline on first launch.

**Status:** the native layer has NOT been run on a device or emulator, and the APK was not built in the authoring sandbox (the Android SDK host was blocked).
The web code paths are tested; the Android-only paths (scheduled notifications, share-sheet backup, permission prompt) are untested.
The downloadable dictionary needs the pack host to allow cross-origin requests (`Access-Control-Allow-Origin: *`); the built-in dictionary needs nothing.

## Tests
```
npm test           # 80 unit/integration tests (logic, IndexedDB, backup, dictionary download over real HTTP)
npm run build && npm run e2e   # real Chromium, phone viewport, real service worker + offline + restart + perf
```
