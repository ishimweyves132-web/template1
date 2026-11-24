// End-to-end in real Chromium: phone + desktop viewports, real service worker, offline, restart, backup, ICS, mock AI gateway.
const { chromium } = require("playwright"); const http = require("http"), fs = require("fs"), os = require("os"), path = require("path");
const root = path.join(__dirname, "../dist"); const out = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-shots-"));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const srv = http.createServer((q, r) => { let f = path.join(root, decodeURIComponent(q.url.split("?")[0])); if (f.endsWith("/")) f += "index.html"; fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; return r.end(); } r.setHeader("content-type", types[path.extname(f)] || "application/octet-stream"); r.end(d); }); }).listen(4191, "127.0.0.1");
const URL = "http://127.0.0.1:4191/"; const results = []; let failed = 0;
async function test(name, fn) { try { await fn(); results.push(1); console.log(`PASS  ${name}`); } catch (e) { failed++; results.push(0); console.log(`FAIL  ${name}\n      ${String(e.message).split("\n").slice(0, 4).join("\n      ")}`); } }
const ok = (c, m) => { if (!c) throw new Error(m); }; const eq = (a, b, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const has = (page, s, sel = "main") => page.waitForFunction(([q, x]) => document.querySelector(q)?.innerText.toLowerCase().includes(x.toLowerCase()), [sel, s]).catch(async () => { throw new Error(`text not found: "${s}" in: ${(await page.locator(sel).innerText()).slice(0, 220)}`); });
const gone = (page, s, sel = "main") => page.waitForFunction(([q, x]) => !document.querySelector(q)?.innerText.toLowerCase().includes(x.toLowerCase()), [sel, s]);
const nav = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(150); };
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const idb = (page, fn, arg) => page.evaluate(([src, a]) => new Promise((res, rej) => { const r = indexedDB.open("lifeos"); r.onsuccess = () => { try { Promise.resolve(eval(src)(r.result, a)).then((v) => { r.result.close(); res(v); }, rej); } catch (e) { rej(e); } }; r.onerror = () => rej(r.error); }), [fn.toString(), arg]);

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-profile-"));
  let ctx = await chromium.launchPersistentContext(userData, mobile); ctx.setDefaultTimeout(8000);
  let page = ctx.pages()[0] || await ctx.newPage(); const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await test("first launch: welcome, bottom navigation on a phone, no errors", async () => {
    await page.goto(URL); await page.waitForSelector("main"); await has(page, "Welcome to LifeOS");
    const pos = await page.locator("nav.nav").evaluate((n) => getComputedStyle(n).position); eq(pos, "fixed", "phone nav position");
    await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true)); await page.reload(); await page.waitForSelector("main");
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker controls the page");
    await page.screenshot({ path: path.join(out, "01-welcome.png") });
  });

  await test("write the vision", async () => {
    await nav(page, "#/vision"); await page.getByRole("button", { name: "Write it" }).click();
    await page.getByLabel("The life I want to build").fill("A calm life where I build things that last."); await page.getByLabel("Why it matters").fill("Time is finite.");
    await page.locator(".sheet .btn.primary.block").click(); await has(page, "A calm life where I build things that last."); await has(page, "years remain in this horizon");
  });

  await test("planning chain: four-year goal -> annual -> quarterly, each linked to its parent", async () => {
    await page.getByRole("button", { name: /Four-year goal/ }).first().click();
    await page.getByLabel("Title").fill("Reach B2 French"); await page.getByLabel("Why does this matter to you?").fill("Live and work in France");
    await page.locator(".sheet .btn.primary.block").click(); await has(page, "Reach B2 French");
    await page.getByRole("button", { name: /^Add Annual objective under Reach B2 French/ }).click(); await page.getByLabel("Title").fill("Pass the DELF B1 exam");
    ok((await page.locator(".sheet").innerText()).includes("Part of Reach B2 French"), "parent shown"); await page.locator(".sheet .btn.primary.block").click();
    await page.getByRole("button", { name: "Expand" }).first().click(); await has(page, "Pass the DELF B1 exam");
    await page.getByRole("button", { name: /^Add Quarterly objective under Pass the DELF B1 exam/ }).click(); await page.getByLabel("Title").fill("Learn 500 core words"); await page.locator(".sheet .btn.primary.block").click();
    await page.getByRole("button", { name: "Expand" }).first().click(); await has(page, "Learn 500 core words");
  });

  await test("measurable result: key result + measurement rolls outcome up to the four-year goal (not from tasks)", async () => {
    await page.getByRole("button", { name: /^Open Learn 500 core words/ }).click();
    await page.getByRole("button", { name: /Key result/ }).click(); await page.getByLabel("Key result", { exact: true }).fill("Words learned");
    await page.getByLabel("Target", { exact: true }).fill("500"); await page.getByRole("button", { name: "Add key result" }).click(); await has(page, "Words learned", ".sheet");
    await page.getByRole("button", { name: "Record a measurement" }).click(); await page.getByPlaceholder("New value").fill("200"); await page.getByRole("button", { name: "Save", exact: true }).click();
    await has(page, "Outcome 40%", ".sheet");
    await page.keyboard.press("Escape"); await page.waitForSelector(".sheet", { state: "detached" });
    const txt = await page.locator("main").innerText(); ok((txt.match(/40%/g) || []).length >= 3, "40% rolled up through the hierarchy: " + txt.slice(0, 500));
    await page.screenshot({ path: path.join(out, "02-vision.png"), fullPage: true });
  });

  await test("invalid key results are refused (target must be beyond the baseline in the stated direction)", async () => {
    await page.getByRole("button", { name: /^Open Learn 500 core words/ }).click(); await page.getByRole("button", { name: /Key result/ }).click();
    await page.getByLabel("Key result", { exact: true }).fill("Bad"); await page.getByLabel("Baseline").fill("100"); await page.getByLabel("Target", { exact: true }).fill("50");
    ok(await page.getByRole("button", { name: "Add key result" }).isDisabled(), "disabled"); await has(page, "The target must be above the baseline", ".sheet");
    await page.getByLabel("Better when").selectOption("down"); ok(!(await page.getByRole("button", { name: "Add key result" }).isDisabled()), "decreasing target is valid"); await page.keyboard.press("Escape");
  });

  await test("task from an objective appears on Today with its goal trail; completing partly records actual time separately", async () => {
    await page.getByRole("button", { name: /^Open Learn 500 core words/ }).click(); await page.getByRole("button", { name: /＋ Task/ }).click();
    await page.getByLabel("Task", { exact: true }).fill("Study 30 words"); await page.locator(".sheet").last().locator(".btn.primary.block").click(); await page.waitForTimeout(250); await page.keyboard.press("Escape");
    await nav(page, "#/today"); await has(page, "Study 30 words"); await has(page, "Reach B2 French");
    await page.getByRole("button", { name: "Complete Study 30 words" }).click(); await page.getByRole("tab", { name: "Partly" }).click();
    await page.getByLabel("Actual minutes").fill("20"); await page.getByLabel("How much was done (%)").fill("60"); await page.getByLabel("What got in the way?").fill("phone call"); await page.locator(".sheet .btn.primary.block").click();
    await has(page, "1/1"); await nav(page, "#/progress"); await has(page, "partial / skipped");
    const t = await page.locator("main").innerText(); ok(/planned 45 min, actual 20 min/.test(t) || /actual 20 min/.test(t), "actual time recorded separately: " + t.slice(0, 300));
    const ex = await idb(page, (db) => new Promise((res) => { const r = db.transaction("executions").objectStore("executions").getAll(); r.onsuccess = () => res(r.result.map((e) => [e.outcome, e.minutes, e.pct, e.reason])); }));
    eq(ex, [["partial", 20, 60, "phone call"]], "execution record");
  });

  await test("tasks do not complete goals: outcome stays at the measured 40% after finishing tasks", async () => {
    await nav(page, "#/progress"); const t = await page.locator("main").innerText(); ok(/Learn 500 core words[\s\S]*?40%/.test(t), "outcome still 40%"); const tl = t.toLowerCase(); ok(tl.includes("execution") && tl.includes("outcomes") && tl.includes("evidence") && tl.includes("consistency"), "four separate dimensions");
  });

  await test("Plan my week: proposal shows reasons, never overlaps a commitment, nothing happens until approved", async () => {
    await nav(page, "#/today"); await page.getByRole("button", { name: "＋ Task" }).click(); await page.getByLabel("Task", { exact: true }).fill("Deep work block"); await page.getByLabel("Estimated minutes").fill("90"); await page.locator(".sheet .btn.primary.block").click(); await page.waitForTimeout(200);
    await nav(page, "#/planner"); await page.getByRole("button", { name: /Commitment/ }).click(); await page.getByLabel("What").fill("Dentist"); await page.getByLabel("From").fill("08:00"); await page.getByLabel("To").fill("12:00"); await page.locator(".sheet .btn.primary.block").click();
    const before = await idb(page, (db) => new Promise((res) => { const r = db.transaction("sessions").objectStore("sessions").count(); r.onsuccess = () => res(r.result); })); eq(before, 0, "no sessions before approval");
    await page.getByRole("button", { name: "Plan my week" }).click(); await has(page, "Nothing is scheduled until you approve", ".sheet"); await has(page, "Why:", ".sheet");
    const text = await page.locator(".sheet").innerText(); const m = [...text.matchAll(/(\d\d):(\d\d)–(\d\d):(\d\d)/g)].map((x) => [Number(x[1]) * 60 + Number(x[2]), Number(x[3]) * 60 + Number(x[4])]);
    ok(m.length >= 1, "a time was proposed: " + text.slice(0, 200)); const todayHeading = new Date().toLocaleDateString("en-GB", { weekday: "long" });
    const idx = text.indexOf(todayHeading.toUpperCase()); if (idx >= 0) { const seg = text.slice(idx, idx + 300); for (const mm of seg.matchAll(/(\d\d):(\d\d)–(\d\d):(\d\d)/g)) { const s = Number(mm[1]) * 60 + Number(mm[2]); ok(s >= 12 * 60 + 10 || s + 1 <= 8 * 60 - 10, "no placement inside the dentist block + buffer today: " + mm[0]); } }
    await page.locator(".sheet .btn.primary.block").click(); await page.waitForSelector(".sheet", { state: "detached" });
    const after = await idb(page, (db) => new Promise((res) => { const r = db.transaction("sessions").objectStore("sessions").getAll(); r.onsuccess = () => res(r.result.filter((s) => s.state === "approved").length); })); ok(after >= 1, "sessions created after approval");
    await has(page, "Scheduled", "main"); await page.screenshot({ path: path.join(out, "03-planner.png"), fullPage: true });
  });

  await test("a missed one-off task is moved automatically within the rules; the change is recorded and can be undone", async () => {
    const y = addD(-1);
    await idb(page, (db, a) => new Promise((res) => { const tx = db.transaction(["tasks", "occurrences"], "readwrite"); tx.objectStore("tasks").put({ id: "late", title: "File the visa form", notes: "", objectiveId: null, priority: 1, estimateMin: 30, deadline: a.dl, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: a.y, status: "active", createdAt: 1 }); tx.objectStore("occurrences").put({ id: "late@" + a.y, taskId: "late", date: a.y, status: "planned", moves: 0, createdAt: 1 }); tx.oncomplete = () => res(); }), { y, dl: addD(5) });
    await page.reload(); await page.waitForSelector("main"); await has(page, "rescheduled within your rules", ".toast");
    await nav(page, "#/planner"); await has(page, "Moved automatically"); const occ = await idb(page, (db) => new Promise((res) => { const r = db.transaction("occurrences").objectStore("occurrences").get("late@" + (new Date(Date.now() - 864e5).getFullYear() + "-" + String(new Date(Date.now() - 864e5).getMonth() + 1).padStart(2, "0") + "-" + String(new Date(Date.now() - 864e5).getDate()).padStart(2, "0"))); r.onsuccess = () => res([r.result.status, r.result.moves, r.result.date]); }));
    eq([occ[0], occ[1]], ["planned", 1], "moved once, back to planned"); ok(occ[2] >= addD(0) && occ[2] <= addD(5), "new date is today..deadline: " + occ[2]);
    await page.locator("li", { hasText: "File the visa form" }).getByRole("button", { name: "Undo" }).click(); await has(page, "Undone");
  });

  await test("protected rules hold: a deadline-passed or protected task is NOT moved, it asks the user", async () => {
    const y = addD(-2);
    await idb(page, (db, a) => new Promise((res) => { const tx = db.transaction(["tasks", "occurrences"], "readwrite"); tx.objectStore("tasks").put({ id: "prot", title: "Sign the lease", notes: "", objectiveId: null, priority: 1, estimateMin: 30, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: true, recurrence: null, onDate: a.y, status: "active", createdAt: 1 }); tx.objectStore("occurrences").put({ id: "prot@" + a.y, taskId: "prot", date: a.y, status: "missed", moves: 0, createdAt: 1 }); tx.oncomplete = () => res(); }), { y });
    await page.reload(); await page.waitForSelector("main"); await nav(page, "#/today"); await has(page, "Sign the lease"); await page.getByRole("button", { name: "Recover within my rules" }).click(); await has(page, "Needs your decision"); await has(page, "protected task");
  });

  await test("ICS import: events block time, re-import does not duplicate, export keeps stable IDs", async () => {
    const d = addD(2).replace(/-/g, ""); const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:ev1@x\r\nSUMMARY:Board meeting\r\nDTSTART:${d}T100000\r\nDTEND:${d}T113000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:ev2@x\r\nSUMMARY:Birthday\r\nDTSTART;VALUE=DATE:${d}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
    const f = path.join(out, "cal.ics"); fs.writeFileSync(f, ics); await nav(page, "#/planner");
    await page.setInputFiles('input[type=file][accept*=ics]', f); await has(page, "1 new event imported", ".toast"); await has(page, "Skipped 1", ".toast");
    await page.setInputFiles('input[type=file][accept*=ics]', f); await has(page, "already present", ".toast");
    const n = await idb(page, (db) => new Promise((res) => { const r = db.transaction("commitments").objectStore("commitments").getAll(); r.onsuccess = () => res(r.result.filter((c) => c.source === "ics").length); })); eq(n, 1, "no duplicate on re-import");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export plan" }).click()]); const p = path.join(out, "plan.ics"); await dl.saveAs(p); const txt = fs.readFileSync(p, "utf8");
    ok(/UID:[^\r\n]+@lifeos/.test(txt) && txt.includes("BEGIN:VCALENDAR"), "export has stable UIDs");
  });

  await test("coach: plain, rule-based observations; AI gateway answers are validated — forbidden powers rejected, good proposals applied only after approval", async () => {
    await nav(page, "#/coach"); await has(page, "What the coach sees"); await has(page, "What the coach may and may not do");
    await nav(page, "#/settings"); await page.locator('select:has(option[value="gateway"])').selectOption("gateway"); await page.getByLabel("Your gateway address").fill("https://gw.test/plan"); await page.getByLabel("Your gateway address").blur();
    const occId = await idb(page, (db) => new Promise((res) => { const r = db.transaction("occurrences").objectStore("occurrences").getAll(); r.onsuccess = () => res(r.result.filter((o) => o.status === "planned").map((o) => [o.id, o.taskId])); }));
    const t0 = occId.find((x) => x[1] === "late") ?? occId[0];
    let sent = ""; await ctx.route("https://gw.test/plan", async (route) => { sent = route.request().postData() ?? ""; await route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ operations: [
      { op: "delete_objective", id: "x" }, { op: "change_deadline", id: "x", value: "2030-01-01" }, { op: "advice", text: "Protect your mornings." },
      { op: "propose_schedule", taskId: t0[1], occId: t0[0], date: addD(1), startMin: 5 * 60, endMin: 6 * 60, why: "too early" }, { op: "propose_task", title: "Book the DELF exam", estimateMin: 20, objectiveId: null, priority: 2, onDate: addD(1), why: "needed" } ] }) }); });
    await nav(page, "#/coach"); await page.getByRole("button", { name: "Ask for a weekly plan" }).click(); await has(page, "Validated suggestions"); await has(page, "3 rejected");
    const t = await page.locator("main").innerText(); ok(/not permitted to delete objective/.test(t) && /not permitted to change deadline/.test(t) && /outside working hours/.test(t), "rejections explained: " + t.slice(0, 700));
    ok(!/notes|evidence|description/i.test(sent) && sent.includes("allowedOperations"), "request is minimal"); ok(!sent.includes("Dentist") && !sent.includes("Board meeting"), "no calendar event titles sent");
    const before = await idb(page, (db) => new Promise((res) => { const r = db.transaction("tasks").objectStore("tasks").getAll(); r.onsuccess = () => res(r.result.length); }));
    await page.getByRole("button", { name: /^Approve \d+ selected/ }).click(); await page.waitForTimeout(300);
    const after = await idb(page, (db) => new Promise((res) => { const r = db.transaction("tasks").objectStore("tasks").getAll(); r.onsuccess = () => res([r.result.length, r.result.some((x) => x.title === "Book the DELF exam")]); })); eq(after, [before + 1, true], "only the validated task was created");
    const audit = await idb(page, (db) => new Promise((res) => { const r = db.transaction("aiAudit").objectStore("aiAudit").getAll(); r.onsuccess = () => res(r.result.map((a) => [a.validation, a.approval])); })); ok(audit.length >= 1 && audit[0][1] === "approved", "audit trail kept: " + JSON.stringify(audit));
    await ctx.unroute("https://gw.test/plan");
    await ctx.route("https://gw.test/plan", (route) => route.fulfill({ status: 500, body: "boom" })); await page.getByRole("button", { name: "Ask for a weekly plan" }).click(); await has(page, "HTTP 500"); await has(page, "Nothing was changed"); await ctx.unroute("https://gw.test/plan");
    await page.screenshot({ path: path.join(out, "04-coach.png"), fullPage: true });
  });

  await test("attachments: attach a file to evidence, preview, download the same bytes, refuse bad files, remove", async () => {
    await nav(page, "#/vision"); await page.getByRole("button", { name: /^Open Learn 500 core words/ }).click();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAHK7yXwAAAABJRU5ErkJggg==", "base64");
    fs.writeFileSync(path.join(out, "proof.png"), png); fs.writeFileSync(path.join(out, "report.pdf"), Buffer.from("%PDF-1.4 fake pdf bytes")); fs.writeFileSync(path.join(out, "run.exe"), "MZ"); fs.writeFileSync(path.join(out, "empty.txt"), "");
    const input = page.locator('.sheet input[type=file][aria-label="Attach a file"]').last();
    await input.setInputFiles(path.join(out, "proof.png")); await has(page, "proof.png", ".sheet"); await page.waitForSelector('.sheet img[alt="Preview of proof.png"]');
    await input.setInputFiles(path.join(out, "report.pdf")); await has(page, "report.pdf", ".sheet");
    await input.setInputFiles(path.join(out, "run.exe")); await has(page, "cannot be attached", ".toast"); await input.setInputFiles(path.join(out, "empty.txt")); await has(page, "empty", ".toast");
    ok(!(await page.locator(".sheet").innerText()).includes("run.exe"), "blocked file not stored");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator("li", { hasText: "report.pdf" }).getByRole("button", { name: "Download" }).click()]); const dp = path.join(out, "dl.pdf"); await dl.saveAs(dp); eq(fs.readFileSync(dp, "utf8"), "%PDF-1.4 fake pdf bytes", "downloaded bytes");
    const stored = await idb(page, (db) => new Promise((res) => { const r = db.transaction("files").objectStore("files").getAll(); r.onsuccess = () => res(r.result.map((f) => [f.name, f.size])); })); eq(stored.sort(), [["proof.png", png.length], ["report.pdf", 23]].sort(), "files stored locally");
    await page.screenshot({ path: path.join(out, "06-evidence.png") });
    page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Remove proof.png" }).click(); await gone(page, "proof.png", ".sheet");
    eq((await idb(page, (db) => new Promise((res) => { const r = db.transaction("files").objectStore("files").count(); r.onsuccess = () => res(r.result); }))), 1, "removed file deleted from storage, not just hidden");
    await page.keyboard.press("Escape");
  });

  await test("Gemini key: saved encrypted, key travels only in a header, models are loaded for your key, and it never reaches a backup", async () => {
    const KEY = "AIzaSyFAKEKEYFORTESTING0123456789abcd"; const calls = [];
    await ctx.route("https://generativelanguage.googleapis.com/**", async (route) => { const rq = route.request(); calls.push({ url: rq.url(), key: rq.headers()["x-goog-api-key"], method: rq.method(), body: rq.postData() });
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" }; if (rq.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (rq.url().includes("/models?")) return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ models: [{ name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] }] }) });
      const parent = JSON.parse(rq.postData() || "{}").contents?.[0]?.parts?.[0]?.text ?? ""; const pid = (/"objective":\{"id":"([^"]+)"/.exec(parent) || [])[1] ?? "x";
      return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ operations: [
        { op: "propose_objective", parentId: pid, title: "Finish the A2 workbook", why: "Foundation", start: addD(1), target: addD(60) },
        { op: "propose_objective", parentId: pid, title: "Way too long", why: "x", start: addD(1), target: "2099-01-01" },
        { op: "delete_objective", id: pid }, { op: "advice", text: "Do 20 words a day." } ] }) }] } }] }) }); });
    await nav(page, "#/settings"); await page.locator('select:has(option[value="gateway"])').selectOption("gemini");
    ok(await page.getByLabel("Paste your Gemini API key").evaluate((e) => e.type === "password"), "key field is masked"); await page.getByLabel("Paste your Gemini API key").fill(KEY); await page.getByRole("button", { name: "Save key" }).click(); await has(page, "Key saved");
    ok(!(await page.locator("main").innerText()).includes(KEY), "key is not shown again"); await has(page, "…abcd");
    await page.getByRole("button", { name: "Test key and load models" }).click(); await has(page, "Key works. 2 models available");
    eq(await page.getByLabel("Model").inputValue(), "gemini-2.5-flash", "flash model chosen first");
    ok(calls.length >= 1 && calls.every((c) => !c.url.includes(KEY) && c.key === KEY), "key only in the header, never in a URL");
    const vault = await idb(page, (db) => new Promise((res) => { const r = db.transaction("kv").objectStore("kv").getAll(); r.onsuccess = () => res(JSON.stringify(r.result.map((x) => (x.key === "deviceKey" ? x.key : x))) ); })); ok(!vault.includes(KEY) && !vault.includes("FAKEKEYFOR"), "not stored as plain text");
    await page.screenshot({ path: path.join(out, "07-settings-ai.png"), fullPage: true });
    // break an objective down with AI
    await nav(page, "#/vision"); await page.getByRole("button", { name: /^Open Pass the DELF B1 exam/ }).click(); const before = await idb(page, (db) => new Promise((res) => { const r = db.transaction("objectives").objectStore("objectives").getAll(); r.onsuccess = () => res(r.result.length); }));
    const sentBefore = calls.length; await page.getByRole("button", { name: "Break this down with AI" }).click(); await has(page, "Validated suggestions", ".sheet"); await has(page, "2 rejected", ".sheet");
    const txt = await page.locator(".sheet").innerText(); ok(/Finish the A2 workbook/.test(txt) && /not permitted to delete objective/.test(txt) && /inside the parent's window/.test(txt), "validated + rejected shown: " + txt.slice(-600));
    const gen = calls.slice(sentBefore).find((c) => c.method === "POST"); ok(gen && gen.key === KEY && !gen.url.includes(KEY), "generateContent used the header key"); const sent = gen.body; ok(sent.includes("Pass the DELF B1 exam") && !sent.includes("Dentist") && !/evidence|notes/i.test(JSON.parse(sent).contents[0].parts[0].text.replace(/allowedOperations/, "")), "only the objective was sent");
    const mid = await idb(page, (db) => new Promise((res) => { const r = db.transaction("objectives").objectStore("objectives").getAll(); r.onsuccess = () => res(r.result.length); })); eq(mid, before, "nothing changed before approval");
    await page.getByRole("button", { name: /^Approve \d+ selected/ }).click(); await page.waitForTimeout(300);
    const objs = await idb(page, (db) => new Promise((res) => { const r = db.transaction("objectives").objectStore("objectives").getAll(); r.onsuccess = () => res(r.result.filter((o) => o.title === "Finish the A2 workbook").map((o) => [o.status, o.level])); })); eq(objs, [["draft", "quarterly"]], "created as a DRAFT at the correct child level");
    const bk = await idb(page, async () => 1); void bk; await nav(page, "#/settings"); const [bdl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]); const bp = path.join(out, "with-key.json"); await bdl.saveAs(bp);
    const btxt = fs.readFileSync(bp, "utf8"); ok(!btxt.includes(KEY) && !btxt.includes("aiKey") && !btxt.includes("deviceKey"), "backup contains no key material");
    page.once("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Remove key" }).click(); await has(page, "Paste your Gemini API key"); await ctx.unroute("https://generativelanguage.googleapis.com/**");
  });

  await test("in-app calendar: edit and delete a commitment, conflicts are flagged, unschedule/undo, moves obey the rules", async () => {
    const d = new Date(); const today = iso(d);
    const sess = await idb(page, (db, today) => new Promise((res) => { const s = db.transaction("sessions").objectStore("sessions").getAll(); s.onsuccess = () => { const o = db.transaction("occurrences").objectStore("occurrences").getAll(); o.onsuccess = () => { const live = new Set(o.result.filter((x) => x.status === "planned").map((x) => x.id)); res(s.result.filter((x) => x.state === "approved" && live.has(x.occId) && x.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)[0]); }; }; }), today);
    ok(sess, "an approved session exists"); await idb(page, (db, a) => new Promise((res) => { const tx = db.transaction("commitments", "readwrite"); tx.objectStore("commitments").put({ id: "conf", title: "Surprise meeting", date: a.date, startMin: a.startMin + 5, endMin: a.endMin + 5, source: "manual", externalId: null, protectedBlock: false, createdAt: 1 }); tx.oncomplete = () => res(); }), { date: sess.date, startMin: sess.startMin, endMin: sess.endMin });
    await page.reload(); await nav(page, "#/planner"); await has(page, "LifeOS never moves your commitments"); await has(page, "Surprise meeting");
    await page.screenshot({ path: path.join(out, "08-conflict.png"), fullPage: true });
    await page.getByRole("button", { name: "Unschedule and re-plan" }).click(); await has(page, "Re-plan around your commitments", ".sheet"); const txt = await page.locator(".sheet").innerText(); const mm = [...txt.matchAll(/(\d\d):(\d\d)–(\d\d):(\d\d)/g)];
    ok(mm.length >= 1, "a new plan was proposed"); await page.locator(".sheet .btn.primary.block").click(); await page.waitForSelector(".sheet", { state: "detached" }); await gone(page, "LifeOS never moves your commitments");
    await page.getByRole("tab", { name: "Week" }).click(); await page.waitForSelector(".wk button.it"); const cm = page.locator(".wk button.it.c", { hasText: "Surprise meeting" }).first(); await cm.click(); await has(page, "Edit commitment", ".sheet");
    await page.getByLabel("What").fill("Renamed meeting"); await page.locator(".sheet .btn.primary.block").click(); await has(page, "Renamed meeting", "main");
    await page.locator(".wk button.it", { hasText: "Renamed meeting" }).first().click(); page.once("dialog", (x) => x.accept()); await page.getByRole("button", { name: "Remove", exact: true }).click(); await page.waitForSelector(".sheet", { state: "detached" });
    const gone1 = await idb(page, (db) => new Promise((res) => { const r = db.transaction("commitments").objectStore("commitments").get("conf"); r.onsuccess = () => res(r.result === undefined); })); ok(gone1, "commitment deleted");
    await page.locator(".wk button.it.s").first().click(); await page.getByLabel("Starts").fill("03:00"); await has(page, "Can't move there:", ".sheet"); ok(/Can't move there: (outside working hours|already started)/.test(await page.locator(".sheet").innerText()), "illegal time refused with a reason"); ok(await page.getByRole("button", { name: "Move", exact: true }).isDisabled(), "illegal move disabled");
    await page.getByLabel("Day").fill(addD(-3)); await has(page, "Can't move there: in the past", ".sheet");
    await page.getByRole("button", { name: "Unschedule" }).click(); await has(page, "Unscheduled", ".toast"); await page.locator("li", { hasText: "Cancel" }).first().waitFor({ state: "hidden" }).catch(() => {});
    await has(page, "Undo", "main"); const li = page.locator("li", { hasText: "Rescheduled" }).first(); void li;
  });

  await test("backup: export, erase everything, restore; damaged and foreign files refused", async () => {
    await nav(page, "#/settings"); const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]); const file = path.join(out, "backup.json"); await dl.saveAs(file);
    const b = JSON.parse(fs.readFileSync(file, "utf8")); ok(b.app === "lifeos" && b.data.tasks.length >= 3, "backup has tasks");
    page.on("dialog", (d) => d.accept()); await page.getByRole("button", { name: "Erase all data…" }).click(); await has(page, "All data erased", ".toast"); await nav(page, "#/today"); await has(page, "Welcome to LifeOS");
    await nav(page, "#/settings"); await page.setInputFiles('input[type=file][accept*=json]', file); await has(page, "Valid backup"); await page.getByRole("button", { name: "Replace my data" }).click(); await has(page, "Backup restored", ".toast");
    await nav(page, "#/vision"); await has(page, "Reach B2 French");
    const bad = JSON.parse(fs.readFileSync(file, "utf8")); bad.data.tasks[0].title = "tampered"; fs.writeFileSync(path.join(out, "bad.json"), JSON.stringify(bad)); fs.writeFileSync(path.join(out, "bad2.json"), '{"hello":1}');
    await nav(page, "#/settings"); await page.setInputFiles('input[type=file][accept*=json]', path.join(out, "bad.json")); await has(page, "damaged"); await page.setInputFiles('input[type=file][accept*=json]', path.join(out, "bad2.json")); await has(page, "not a LifeOS backup");
  });

  await test("fully offline: reload from cache, every screen renders, a task can be added and completed", async () => {
    await ctx.setOffline(true);
    try {
      await page.reload(); await page.waitForSelector("main");
      for (const h of ["today", "vision", "planner", "progress", "coach", "settings"]) { await nav(page, "#/" + h); ok((await page.locator("main").innerText()).length > 40, "renders " + h); }
      await nav(page, "#/today"); await page.getByLabel("Quick add a task for today").fill("Offline task"); await page.getByRole("button", { name: "Add", exact: true }).click(); await has(page, "Offline task");
      await page.getByRole("button", { name: "Complete Offline task" }).click(); await page.locator(".sheet .btn.primary.block").click(); await has(page, "resolved");
    } finally { await ctx.setOffline(false); }
  });

  await page.close(); await ctx.close();
  ctx = await chromium.launchPersistentContext(userData, mobile); ctx.setDefaultTimeout(8000); page = ctx.pages()[0] || await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await test("persistence: after fully closing and relaunching the browser, everything is still there", async () => {
    await page.goto(URL + "#/vision"); await page.waitForSelector("main"); await has(page, "A calm life where I build things that last."); await has(page, "Reach B2 French");
    await nav(page, "#/today"); await has(page, "Done today"); await has(page, "Offline task");
  });

  await test("accessibility basics on phone: named controls, tap targets >= 34px, no horizontal scroll", async () => {
    for (const h of ["today", "vision", "planner", "progress", "coach", "settings"]) {
      await nav(page, "#/" + h);
      const bad = await page.evaluate(() => [...document.querySelectorAll("button, a, input, select, textarea")].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width || e.type === "checkbox" || e.type === "file" || e.hidden) return false; const name = (e.getAttribute("aria-label") || e.innerText || e.labels?.[0]?.innerText || e.placeholder || "").trim(); return !name || r.height < 34; }).map((e) => e.outerHTML.slice(0, 90)));
      eq(bad, [], `${h} unnamed/small controls`); ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${h} horizontal overflow`);
    }
  });

  await test("desktop layout: sidebar navigation and two-column pages", async () => {
    const dctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "lifeos-d-")), { viewport: { width: 1280, height: 900 } }); const d = dctx.pages()[0] || await dctx.newPage(); await d.goto(URL); await d.waitForSelector("main");
    const s = await d.locator("nav.nav").evaluate((n) => { const c = getComputedStyle(n); return [c.position, c.flexDirection, n.getBoundingClientRect().width]; }); eq([s[0], s[1]], ["sticky", "column"], "sidebar"); ok(s[2] >= 200, "sidebar width");
    ok((await d.locator(".brand").isVisible()), "brand shown"); await d.screenshot({ path: path.join(out, "05-desktop.png") }); await dctx.close();
  });
  await test("no console or page errors during the whole run", async () => { eq(errors.filter((e) => !/Failed to load resource|ERR_INTERNET|net::ERR|gw\.test|HTTP 500/.test(e)), []); });
  await ctx.close(); srv.close();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed. Screenshots: ${out}`); process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
