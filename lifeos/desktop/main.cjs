// LifeOS desktop shell (Windows / Linux / macOS). It only serves the already-built web app from disk under a private,
// secure scheme (app://lifeos), so IndexedDB, crypto and the service-free offline behaviour work exactly as in the browser.
// Hardening: sandboxed renderer, no Node in the page, strict CSP, navigation locked, only Gemini may be contacted.
const { app, BrowserWindow, Menu, Tray, nativeImage, protocol, session, shell } = require("electron");
const fs = require("node:fs"); const path = require("node:path");

const SMOKE = process.argv.includes("--smoke"); const SHOT = (process.argv.find((a) => a.startsWith("--smoke-shot=")) || "").slice(13);
const OUT = (process.argv.find((a) => a.startsWith("--smoke-out=")) || "").slice(12);
const ROOT = path.join(__dirname, "..", "dist"); const ORIGIN = "app://lifeos";
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".map": "application/json" };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://generativelanguage.googleapis.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

if (process.env.LIFEOS_NO_SANDBOX) app.commandLine.appendSwitch("no-sandbox"); // CI containers only
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setAppUserModelId("com.lifeos.app");
if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); }

let win = null; let tray = null; let quitting = false;
const serve = async (req) => {
  const u = new URL(req.url); if (u.host !== "lifeos") return new Response("Not found", { status: 404 });
  let rel = decodeURIComponent(u.pathname); if (rel === "/" || rel === "") rel = "/index.html";
  const file = path.normalize(path.join(ROOT, rel)); if (!file.startsWith(ROOT + path.sep) && file !== ROOT) return new Response("Forbidden", { status: 403 });
  try { const buf = await fs.promises.readFile(file); return new Response(buf, { headers: { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" } }); }
  catch { return new Response("Not found", { status: 404 }); }
};

function create() {
  win = new BrowserWindow({ width: 1280, height: 860, minWidth: 380, minHeight: 600, show: !SMOKE, backgroundColor: "#f5f3ee", title: "LifeOS", autoHideMenuBar: true,
    icon: path.join(__dirname, "..", "build", "icon.png"), webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false } });
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => { try { const p = new URL(url); if (p.protocol === "https:" || p.protocol === "mailto:") void shell.openExternal(url); } catch { /* ignore */ } return { action: "deny" }; });
  wc.on("will-navigate", (e, url) => { if (!url.startsWith(ORIGIN + "/")) { e.preventDefault(); try { if (new URL(url).protocol === "https:") void shell.openExternal(url); } catch { /* ignore */ } } });
  win.on("close", (e) => { if (!quitting && !SMOKE && process.platform !== "darwin" && tray) { e.preventDefault(); win.hide(); } });
  win.on("closed", () => { win = null; });
  void win.loadURL(ORIGIN + "/index.html");
  if (SMOKE) smoke(wc);
}

function makeTray() {
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, "..", "build", "icon.png")).resize({ width: 24, height: 24 }); tray = new Tray(img); tray.setToolTip("LifeOS");
    const show = () => { if (!win) create(); else { win.show(); win.focus(); } };
    tray.setContextMenu(Menu.buildFromTemplate([{ label: "Open LifeOS", click: show }, { type: "separator" }, { label: "Quit", click: () => { quitting = true; app.quit(); } }])); tray.on("click", show);
  } catch { tray = null; /* no tray on this desktop: closing the window then quits */ }
}

// CI check: load the real build in the real Electron, prove the app renders, storage and crypto work, and no page errors occurred.
function smoke(wc) {
  const errors = []; wc.on("console-message", (_e, level, msg) => { if (level >= 3) errors.push(msg); }); wc.on("render-process-gone", (_e, d) => errors.push("renderer gone: " + d.reason));
  const done = (line, code) => { console.log(line); if (OUT) try { fs.writeFileSync(OUT, line + "\n"); } catch { /* ignore */ } app.exit(code); }; const fail = (m) => done("SMOKE_FAIL " + m, 1); const timer = setTimeout(() => fail("timeout"), 60000);
  wc.once("did-fail-load", (_e, code, desc) => fail(`load failed ${code} ${desc}`));
  wc.once("did-finish-load", async () => {
    try {
      const js = `(async () => { for (let i = 0; i < 100 && !document.querySelector('.nav'); i++) await new Promise(r => setTimeout(r, 100));
        const out = { origin: location.origin, secure: isSecureContext, nav: !!document.querySelector('.nav'), brand: document.querySelector('.brand')?.textContent || '', crypto: !!(crypto && crypto.subtle), tabs: [...document.querySelectorAll('.nav a')].map(a => a.textContent.trim()), node: typeof require + typeof process };
        out.idb = await new Promise(res => { const r = indexedDB.open('smoke-test', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => { r.result.close(); indexedDB.deleteDatabase('smoke-test'); res(true); }; r.onerror = () => res(false); });
        out.aes = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']).then(() => true, () => false);
        out.text = document.body.innerText.slice(0, 160); return out; })()`;
      const r = await wc.executeJavaScript(js);
      if (SHOT) { const img = await wc.capturePage(); fs.writeFileSync(SHOT, img.toPNG()); }
      clearTimeout(timer); const bad = [];
      if (r.origin !== "app://lifeos") bad.push("origin " + r.origin); if (!r.secure) bad.push("not a secure context"); if (!r.nav || !/LifeOS/i.test(r.brand)) bad.push("app did not render"); if (!r.crypto || !r.aes) bad.push("no WebCrypto"); if (!r.idb) bad.push("no IndexedDB");
      if (r.node !== "undefinedundefined") bad.push("Node leaked into the page: " + r.node); if (r.tabs.length < 5) bad.push("tabs missing: " + r.tabs.join(","));
      if (errors.length) bad.push("console errors: " + errors.join(" | ").slice(0, 300));
      if (bad.length) return fail(bad.join("; ")); done("SMOKE_OK " + JSON.stringify({ ...r, electron: process.versions.electron, platform: process.platform }), 0);
    } catch (e) { fail(String(e && e.message || e)); }
  });
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
app.on("before-quit", () => { quitting = true; });
app.on("window-all-closed", () => { if (!tray || SMOKE) app.quit(); });
app.on("activate", () => { if (!win) create(); });
app.whenReady().then(() => {
  protocol.handle("app", serve);
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => cb({ responseHeaders: { ...d.responseHeaders, "Content-Security-Policy": [CSP] } }));
  session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "notifications"));
  session.defaultSession.setPermissionCheckHandler((_wc, perm) => perm === "notifications");
  Menu.setApplicationMenu(null); if (!SMOKE) makeTray(); create();
});
