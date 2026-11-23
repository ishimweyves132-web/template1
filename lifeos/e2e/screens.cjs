// Visual QA: loads the example plan through the real UI, approves a weekly plan, then screenshots every screen on phone and desktop.
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), path = require("path");
const out = process.argv[2] || "shots"; fs.mkdirSync(out, { recursive: true }); const root = path.join(__dirname, "../dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", types[path.extname(f)] || "application/octet-stream"); r.end(d); }); }).listen(4190, "127.0.0.1");
(async () => {
  const b = await chromium.launch(); const errs = [];
  const mk = async (vp, mobile) => { const c = await b.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile }); const p = await c.newPage(); p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text())); return p; };
  const phone = await mk({ width: 390, height: 844 }, true);
  await phone.goto("http://127.0.0.1:4190/#/today"); await phone.waitForSelector("main");
  await phone.getByRole("button", { name: "Load an example plan" }).click(); await phone.waitForSelector("text=Your three priorities"); await phone.waitForTimeout(500);
  await phone.goto("http://127.0.0.1:4190/#/planner"); await phone.getByRole("button", { name: "Plan my week" }).click(); await phone.waitForSelector("text=Approve"); await phone.getByRole("button", { name: /^Approve \d+ session/ }).click(); await phone.waitForTimeout(400);
  const shot = async (p, name, hash, fn, full = true) => { await p.goto("http://127.0.0.1:4190/#/" + hash); await p.reload(); await p.waitForSelector("main"); await p.waitForTimeout(350); if (fn) await fn(p); await p.screenshot({ path: path.join(out, name + ".png"), fullPage: full }); };
  await shot(phone, "p1-today", "today"); await shot(phone, "p2-vision", "vision", async (p) => { for (const c of await p.locator(".caret:not([disabled])").all()) await c.click().catch(() => {}); await p.waitForTimeout(200); for (const c of await p.locator(".caret:not([disabled])").all()) await c.click().catch(() => {}); });
  await shot(phone, "p3-planner", "planner"); await shot(phone, "p4-progress", "progress"); await shot(phone, "p5-coach", "coach"); await shot(phone, "p6-settings", "settings");
  await shot(phone, "p7-complete", "today", async (p) => { await p.getByRole("button", { name: /^Complete / }).first().click(); await p.waitForTimeout(200); }, false);
  await shot(phone, "p8-objective", "vision", async (p) => { await p.getByRole("button", { name: /^Open / }).first().click(); await p.waitForTimeout(200); }, false);
  const desk = await mk({ width: 1280, height: 900 }, false);
  await desk.goto("http://127.0.0.1:4190/#/today"); await desk.waitForSelector("main"); await desk.getByRole("button", { name: "Load an example plan" }).click(); await desk.waitForSelector("text=Your three priorities");
  await desk.goto("http://127.0.0.1:4190/#/planner"); await desk.getByRole("button", { name: "Plan my week" }).click(); await desk.getByRole("button", { name: /^Approve \d+ session/ }).click(); await desk.waitForTimeout(300);
  await shot(desk, "d1-today", "today", null, false); await shot(desk, "d2-vision", "vision", async (p) => { for (let i = 0; i < 2; i++) for (const c of await p.locator(".caret:not([disabled])").all()) await c.click().catch(() => {}); }, false);
  await shot(desk, "d3-planner", "planner", null, false); await shot(desk, "d4-progress", "progress", null, false);
  console.log("errors:", errs); await b.close(); srv.close();
})();
