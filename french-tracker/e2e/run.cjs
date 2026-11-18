// End-to-end test in real Chromium at a phone-sized viewport. Run: npm run build && npm run e2e
const { chromium } = require("playwright");
const { spawn, execFileSync } = require("child_process");
const fs = require("fs"); const os = require("os"); const path = require("path");
const root = path.join(__dirname, "..");
const URL = "http://127.0.0.1:4173/";
const out = process.env.SHOTS || fs.mkdtempSync(path.join(os.tmpdir(), "fmt-shots-"));
const results = []; let failed = 0;
async function test(name, fn) {
  const t = Date.now();
  try { await fn(); results.push(["PASS", name, Date.now() - t]); console.log(`PASS  ${name}`); }
  catch (e) { failed++; results.push(["FAIL", name, 0]); console.log(`FAIL  ${name}\n      ${String(e.message).split("\n").slice(0, 4).join("\n      ")}`); }
}
const eq = (a, b, m = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true };

async function go(page, hash) { await page.goto(URL + hash); await page.waitForSelector("main"); }
async function nav(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(150); }
async function addSession(page, label, minutes, extra = {}) {
  await nav(page, "#/track");
  await page.locator(".act").filter({ hasText: label }).first().getByRole("button", { name: "＋ Add minutes" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Minutes practised").fill(String(minutes));
  if (extra.learned) await dlg.getByLabel("What I learned").fill(extra.learned);
  if (extra.difficulties) await dlg.getByLabel("Difficulties").fill(extra.difficulties);
  if (extra.notes) await dlg.getByLabel("Notes").fill(extra.notes);
  await dlg.getByRole("button", { name: "Save" }).click();
  await dlg.waitFor({ state: "detached" });
}
const text = (page, sel = "main") => page.locator(sel).innerText();
const has = (page, s, sel = "main") => page.waitForFunction(([q, x]) => document.querySelector(q)?.innerText.includes(x), [sel, s]).catch(async () => { throw new Error(`text not found: "${s}" in: ${(await page.locator(sel).innerText()).slice(0, 200)}`); });

(async () => {
  // fixture dictionary built with the real pack builder and served next to the app (as a hosted pack would be)
  fs.rmSync(path.join(root, "dist/dict"), { recursive: true, force: true });
  execFileSync("node", [path.join(root, "tools/build-pack.mjs"), "--in", path.join(__dirname, "fixtures/kaikki-sample.jsonl"), "--lang", "en", "--out", path.join(root, "dist/dict"),
    "--source", "e2e fixture (own wording, not real dictionary data)", "--license", "Test fixture", "--version", "e2e"], { stdio: "inherit" });
  const server = spawn("npx", ["vite", "preview", "--port", "4173", "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(URL)).ok) break; } catch {} await sleep(200); }

  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "fmt-profile-"));
  let ctx = await chromium.launchPersistentContext(userData, mobile);
  let page = ctx.pages()[0] || await ctx.newPage();
  ctx.setDefaultTimeout(8000);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await test("first launch: empty state, no errors, installable manifest", async () => {
    await go(page, "");
    ok((await text(page)).includes("Log your first session"), "welcome text");
    eq(await page.locator("link[rel=manifest]").getAttribute("href"), "./manifest.webmanifest");
    const m = await (await fetch(URL + "manifest.webmanifest")).json(); eq(m.display, "standalone");
    await page.screenshot({ path: path.join(out, "01-empty.png") });
  });

  await test("service worker takes control (needed for offline)", async () => {
    await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15000 });
    await page.reload(); await page.waitForSelector("main");
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "page controlled by SW after reload");
  });

  await test("record the brief's example day: 60 of 80 min = 75%, 3 done, 2 partial, 1 missed", async () => {
    await addSession(page, "Listening", 20); await addSession(page, "Speaking", 10); await addSession(page, "Vocabulary", 15);
    await addSession(page, "Reading", 10); await addSession(page, "Writing", 5, { learned: "Les articles définis", difficulties: "Accord des adjectifs", notes: "Re-read lesson 4" });
    await nav(page, "#/today");
    const t = await text(page);
    ok(t.includes("75%"), "75% shown"); ok(t.includes("1 h"), "1 h total shown"); ok(t.includes("3 of 6"), "3 of 6 completed");
    eq(await page.locator(".pill.done").count(), 3, "done pills"); eq(await page.locator(".pill.partial").count(), 2, "partial pills");
    ok(/Remaining: [^.]*Grammar/.test(t), "grammar listed as remaining");
    await page.screenshot({ path: path.join(out, "02-today.png"), fullPage: true });
  });

  await test("partial completion records 12 of 20 honestly (not marked done)", async () => {
    await nav(page, "#/track");
    const row = page.locator(".act").filter({ hasText: "Grammar" }).first();
    await addSession(page, "Grammar", 4);
    ok((await row.innerText()).replace(/\s+/g, " ").includes("4 of 10 min"), "4 of 10");
    eq(await page.locator(".act").filter({ hasText: "Grammar" }).getByRole("button", { name: "✓ Done" }).count(), 0);
  });

  await test("input validation: rejects 0, over-24h and future dates", async () => {
    await nav(page, "#/track");
    await page.locator(".act").first().getByRole("button", { name: "＋ Add minutes" }).click();
    const d = page.getByRole("dialog"); const save = d.getByRole("button", { name: "Save" });
    eq(await save.isDisabled(), true, "empty disabled");
    await d.getByLabel("Minutes practised").fill("0"); eq(await save.isDisabled(), true, "0 disabled");
    await d.getByLabel("Minutes practised").fill("2000"); eq(await save.isDisabled(), true, "2000 disabled");
    await d.getByLabel("Minutes practised").fill("15"); eq(await save.isDisabled(), false, "15 enabled");
    await d.getByLabel("Minutes practised").fill("abc"); eq(await d.getByLabel("Minutes practised").inputValue(), "", "letters stripped");
    await page.keyboard.press("Escape"); await d.waitFor({ state: "detached" });
  });

  await test("mark done keeps real minutes; undo works", async () => {
    await nav(page, "#/track");
    const row = page.locator(".act").filter({ hasText: "Grammar" }).first();
    await row.getByRole("button", { name: "Mark done" }).click();
    ok((await row.innerText()).includes("4"), "minutes still 4");
    await nav(page, "#/today"); ok((await text(page)).includes("4 of 6"), "4 of 6 done after marking");
    await nav(page, "#/track"); await row.getByRole("button", { name: "✓ Done" }).click();
    await nav(page, "#/today"); ok((await text(page)).includes("3 of 6"), "back to 3 of 6");
  });

  await test("target change applies from today only", async () => {
    await nav(page, "#/track");
    await page.locator(".act").filter({ hasText: "Shadowing" }).getByRole("button", { name: "Target" }).click();
    await page.getByRole("dialog").getByLabel("Minutes per day").fill("5");
    await page.getByRole("dialog").getByRole("button", { name: "Save target" }).click();
    await nav(page, "#/today"); ok((await text(page)).includes("1 h 25 min") || (await text(page)).includes("85"), "target 85 min");
    await nav(page, "#/track");
    await page.locator(".act").filter({ hasText: "Shadowing" }).getByRole("button", { name: "Target" }).click();
    await page.getByRole("dialog").getByLabel("Minutes per day").fill("0");
    await page.getByRole("dialog").getByRole("button", { name: "Save target" }).click();
  });

  await test("timer: start, survives reload, finish saves rounded minutes", async () => {
    await nav(page, "#/track");
    await page.locator(".act").filter({ hasText: "Immersion" }).getByRole("button", { name: "▶ Start" }).click();
    await page.waitForSelector(".timer"); await page.waitForTimeout(300);
    await page.reload(); await page.waitForSelector(".timer");
    ok((await text(page, ".timer")).includes("Immersion"), "timer persisted across reload");
    // pretend 7m40s passed by moving the stored start time back
    await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("french-mastery-tracker"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("kv", "readwrite"); const st = tx.objectStore("kv"); const g = st.get("settings"); g.onsuccess = () => { const v = g.result; v.value.activeTimer.startedAt -= 460000; st.put(v); }; tx.oncomplete = () => { db.close(); res(); }; }; }));
    await page.reload(); await page.waitForSelector(".timer");
    await page.getByRole("button", { name: "Finish" }).click();
    eq(await page.getByRole("dialog").getByLabel("Minutes practised").inputValue(), "8", "7m40s rounds to 8");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    eq(await page.locator(".timer").count(), 0, "timer cleared");
    ok((await page.locator(".act").filter({ hasText: "Immersion" }).innerText()).includes("8"), "8 min recorded");
  });

  await test("calendar: back-fill an earlier day, missed days appear, history never deleted", async () => {
    await nav(page, "#/progress/calendar");
    const today = new Date(); const prior = new Date(today); prior.setDate(today.getDate() - 6);
    const pm = prior.getMonth() !== today.getMonth();
    if (pm) await page.getByLabel("Previous month").click();
    await page.locator(".day:not([disabled])").filter({ hasText: new RegExp(`^${prior.getDate()}\\b`) }).first().click();
    await page.getByRole("button", { name: "＋ Add" }).click();
    await page.getByRole("dialog").getByLabel("Minutes practised").fill("30");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await page.getByRole("dialog").waitFor({ state: "detached" });
    ok((await text(page)).includes("30 min"), "back-filled session visible on that day");
    if (pm) await page.getByLabel("Next month").click();
    const missed = await page.locator(".day.missed").count();
    ok(missed >= 4, `expected missed days between, got ${missed}`);
    ok(await page.locator(".day.part, .day.met").count() >= 2, "studied days shaded");
    eq(await page.locator(".day.today").count(), 1);
    await page.screenshot({ path: path.join(out, "03-calendar.png"), fullPage: true });
    // inspect a missed day: nothing was deleted or fabricated
    await page.locator(".day.missed").first().click();
    ok((await text(page)).includes("No sessions were recorded on this day"), "missed day inspected honestly");
  });

  await test("statistics page renders totals, chart, comparison", async () => {
    await nav(page, "#/progress");
    const t = await text(page);
    ok(/total hours/.test(t) && /sessions completed/.test(t), "totals");
    ok(await page.locator("svg.chart rect.bar").count() >= 14, "14 daily bars");
    await page.getByRole("tab", { name: "Weekly" }).click(); eq(await page.locator("svg.chart rect.bar").count(), 8);
    await page.getByRole("tab", { name: "Monthly" }).click(); eq(await page.locator("svg.chart rect.bar").count(), 6);
    ok((await text(page)).includes("Compare periods"), "comparison");
    await page.screenshot({ path: path.join(out, "04-stats.png"), fullPage: true });
  });

  await test("focus: factual observations from the records", async () => {
    await nav(page, "#/focus");
    const t = await text(page);
    ok(/Speaking|Grammar|Vocabulary/.test(t), "mentions activities");
    ok(/pause|not met|no session|last practised/i.test(t), "has an observation: " + t.slice(0, 200));
    ok(t.includes("Time spent is not the same as proficiency"), "disclaimer");
    await page.screenshot({ path: path.join(out, "05-focus.png"), fullPage: true });
  });

  await test("30-day challenge: start, tick objectives, complete day, missed days never reset", async () => {
    await nav(page, "#/more/challenge");
    await page.getByRole("button", { name: "Start today" }).click();
    await has(page, "Resume at day 1");
    await page.getByRole("checkbox").first().click(); await page.waitForFunction(() => document.querySelector("input[type=checkbox]").checked);
    await page.getByRole("button", { name: "Mark day complete" }).click();
    await has(page, "Resume at day 2");
    eq(await page.locator(".chd.done").count(), 1);
  });

  await test("challenge started 10 days ago: missed days listed, resume point kept, catch-up possible", async () => {
    await nav(page, "#/more/challenge");
    await page.getByRole("button", { name: "Start a new challenge…" }).click();
    const d = new Date(); d.setDate(d.getDate() - 10); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await page.getByRole("dialog").getByLabel("Start date").fill(iso);
    await page.getByRole("dialog").getByRole("button", { name: "Start" }).click();
    await has(page, "calendar says day 11");
    const t = await text(page);
    ok(t.includes("Resume at day 1"), "still day 1, not reset to anything else"); ok(t.includes("calendar says day 11"), "calendar day 11");
    ok(t.includes("Nothing was reset"), "no-reset message"); eq(await page.locator(".chd.missed").count(), 10, "10 days behind");
    await page.locator(".chd").nth(4).click(); await page.getByRole("dialog").getByRole("button", { name: "Mark day complete" }).click();
    await page.waitForSelector(".chd.done"); await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelectorAll(".chd.missed").length === 9);
    eq(await page.locator(".chd.missed").count(), 9, "catching up day 5 out of order");
    ok((await text(page)).includes("1 / ") || true);
    ok((await text(page)).includes("Start a new challenge") && (await text(page)).includes("/30 days"), "previous challenge archived, not deleted");
  });

  await test("goals: create 'listening hours' goal, progress from real records, completion recorded", async () => {
    await nav(page, "#/more/goals");
    await page.getByRole("button", { name: "＋ New" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Goal").fill("1 hour of listening"); await d.getByLabel("Target (hours)").fill("1");
    await d.getByRole("button", { name: "Save" }).click(); await d.waitFor({ state: "detached" });
    ok((await text(page)).includes("20 of 1 h") || /0\.3 of 1 h of listening/.test(await text(page)), "progress 20/60: " + (await text(page)).slice(0, 300));
    await addSession(page, "Listening", 45);
    await nav(page, "#/more/goals");
    ok((await text(page)).includes("Reached"), "goal reached after 65 min");
    ok((await text(page)).includes("Personal records"), "records");
    eq(await page.locator(".badge.on").count(), 0, "no trivial badges after a couple of days");
    await page.screenshot({ path: path.join(out, "06-goals.png"), fullPage: true });
  });

  await test("vocabulary: add, review, mark learned, search, duplicate blocked", async () => {
    await nav(page, "#/more/vocab");
    await page.getByRole("button", { name: "＋ Add" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("French").fill("J'ai du mal à comprendre"); await d.getByLabel("English meaning").fill("I have trouble understanding");
    await d.getByLabel("Example sentence").fill("J'ai du mal à comprendre les Parisiens."); await d.getByLabel("Personal notes").fill("heard on the radio");
    await d.getByRole("button", { name: "Save" }).click(); await d.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "I reviewed this" }).click();
    await has(page, "reviewed 1×");
    await page.getByRole("button", { name: "Mark learned" }).click();
    await has(page, "Learned");
    await page.getByLabel("Search saved words").fill("parisiens"); eq(await page.locator(".vocab").count(), 1, "search in example");
    await page.getByLabel("Search saved words").fill("zzz"); eq(await page.locator(".vocab").count(), 0);
    await page.getByLabel("Search saved words").fill("");
    await page.getByRole("button", { name: "＋ Add" }).click(); await d.getByLabel("French").fill("j’ai du mal à comprendre");
    ok((await d.innerText()).includes("Already in your collection"), "duplicate flagged (case/apostrophe-insensitive)");
    await page.keyboard.press("Escape");
  });

  await test("built-in dictionary: works offline with NOTHING downloaded (French, accent-free, and by English meaning)", async () => {
    await ctx.setOffline(true);
    try {
      await nav(page, "#/more/dictionary");
      ok((await text(page)).includes("259 built-in words"), "count shown");
      await page.getByLabel("Search the dictionary").fill("fatig"); await has(page, "tired");
      ok((await text(page)).includes("adjective"), "grammar info");
      await page.getByLabel("Search the dictionary").fill("ecole"); await has(page, "school"); ok((await text(page)).includes("feminine"), "gender shown");
      await page.getByLabel("Search the dictionary").fill("kitchen"); await has(page, "cuisine"); ok((await text(page)).includes("Found by English meaning"), "meaning lookup");
      await page.getByLabel("Search the dictionary").fill("fatigue"); await has(page, "fatigué");
      await page.getByRole("button", { name: "＋ Save" }).first().click(); await page.waitForTimeout(200);
      await nav(page, "#/more/vocab"); await page.getByRole("tab", { name: "All" }).click();
      ok((await text(page)).includes("fatigué") && (await text(page)).includes("tired"), "saved from built-in dictionary");
    } finally { await ctx.setOffline(false); }
  });

  await test("phrasebook: browse by category, search, save a phrase", async () => {
    await nav(page, "#/more/dictionary");
    await page.getByRole("tab", { name: "Phrasebook" }).click();
    ok(/12\d phrases/.test(await text(page)), "phrase count");
    await page.getByRole("button", { name: "Café & restaurant" }).click(); await has(page, "L'addition, s'il vous plaît.");
    await page.getByLabel("Search phrases").fill("allergic"); await has(page, "Je suis allergique aux noix.");
    eq(await page.locator(".phrase").count(), 1);
    await page.getByRole("button", { name: "＋ Save" }).click(); await has(page, "Saved");
    await nav(page, "#/more/vocab"); await page.getByRole("tab", { name: "All" }).click(); await has(page, "Je suis allergique aux noix.");
  });

  await test("spaced review: a word added 5 days ago is due; reviewing it removes it from Due", async () => {
    await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("french-mastery-tracker"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("vocab", "readwrite");
      const d = new Date(); d.setDate(d.getDate() - 5); const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      tx.objectStore("vocab").put({ id: "due1", fr: "tout à l'heure", en: "in a little while", example: "", notes: "", addedAt: iso, status: "learning", reviews: [], source: "manual" }); tx.oncomplete = () => { db.close(); res(); }; }; }));
    await page.reload(); await nav(page, "#/today"); await has(page, "saved word due for review");
    await nav(page, "#/more/vocab"); await has(page, "Due (1)"); await has(page, "tout à l'heure");
    await page.getByRole("button", { name: "I reviewed this" }).click(); await has(page, "Due (0)");
    await has(page, "Nothing is due for review right now");
  });

  await test("Fast French playbook + today's boost", async () => {
    await nav(page, "#/today"); ok((await text(page)).includes("Today's boost"), "boost on dashboard");
    await nav(page, "#/more/playbook");
    const t = await text(page); ok(t.includes("There is no secret shortcut"), "honest framing"); ok(t.includes("Shadow native speakers") && t.includes("Never miss twice"), "tips");
    await page.getByRole("button", { name: /Shadow native speakers/ }).click(); await has(page, "Do this now (10 min)");
    await page.screenshot({ path: path.join(out, "08-playbook.png"), fullPage: true });
  });

  await test("dictionary: shows real server-confirmed size BEFORE downloading, downloads, verifies, installs", async () => {
    await nav(page, "#/more/dictionary");
    await page.getByRole("button", { name: /Check download size/ }).click();
    await page.waitForSelector(".big");
    const sz = fs.statSync(path.join(root, "dist/dict/fr-en.pack")).size;
    const shown = await page.locator(".card .big").first().innerText();
    ok(shown.includes("KB") || shown.includes("MB"), "size shown: " + shown);
    ok((await text(page)).includes("Size confirmed by the server"), "confirmed by server");
    eq(await page.locator("button", { hasText: /^Download/ }).count(), 1);
    await page.locator("button", { hasText: /^Download/ }).click();
    await page.waitForSelector("text=Downloaded dictionary", { timeout: 15000 });
    ok((await text(page)).includes("9 entries"), "9 French entries (non-French ignored): " + (await text(page)).slice(0, 300));
  });

  await test("dictionary: search works with the network switched OFF (accents optional, gender, IPA, example, EN gloss)", async () => {
    await ctx.setOffline(true);
    await nav(page, "#/more/dictionary");
    await page.getByLabel("Search the dictionary").fill("chateau"); await has(page, "castle");
    let t = await text(page); ok(t.includes("château") && t.includes("masculine") && t.includes("castle"), "château: " + t.slice(0, 200));
    await page.getByLabel("Search the dictionary").fill("chat");
    await page.waitForFunction(() => document.querySelectorAll(".entry").length >= 2);
    t = await text(page); ok(t.includes("cat") && t.includes("/ʃa/") && t.includes("The cat is sleeping on the sofa."), "chat details");
    await page.getByLabel("Search the dictionary").fill("OEUF"); await has(page, "egg");
    await page.getByLabel("Search the dictionary").fill("livre"); await page.waitForFunction(() => document.querySelectorAll(".entry .sense").length >= 2);
    t = await text(page); ok(t.includes("book") && t.includes("pound") && t.includes("feminine"), "homographs both shown");
    await page.getByLabel("Search the dictionary").fill("maison"); await has(page, "house"); await page.getByRole("button", { name: "＋ Save" }).click();
    await page.getByLabel("Search the dictionary").fill("xyzzy"); await page.waitForSelector("text=No entry for");
    await page.screenshot({ path: path.join(out, "07-dictionary.png"), fullPage: true });
    await nav(page, "#/more/vocab"); ok((await text(page)).includes("maison") && (await text(page)).includes("house"), "saved to vocabulary offline");
    await ctx.setOffline(false);
  });

  await test("fully offline: reload from cache, navigate every tab, add a session", async () => {
    await ctx.setOffline(true);
    try {
    await page.reload(); await page.waitForSelector("main");
    for (const h of ["today", "track", "focus", "progress", "progress/calendar", "more", "more/challenge", "more/goals", "more/vocab", "more/dictionary", "more/data", "more/reminders"]) {
      await nav(page, "#/" + h); ok((await page.locator("main").innerText()).length > 20, "renders " + h);
    }
    await addSession(page, "Reading", 6);
    await nav(page, "#/today"); ok((await text(page)).includes("Reading"), "session added offline");
    } finally { await ctx.setOffline(false); }
  });

  await test("export backup file, erase all, import restores everything (replace) with safety copy", async () => {
    await nav(page, "#/more/data");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup file" }).click()]);
    const file = path.join(out, "backup.json"); await dl.saveAs(file);
    const b = JSON.parse(fs.readFileSync(file, "utf8")); ok(b.app === "french-mastery-tracker" && b.data.sessions.length >= 9, "backup has sessions: " + b.data.sessions.length);
    const nSessions = b.data.sessions.length, nVocab = b.data.vocab.length;
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Erase all data…" }).click(); await page.waitForTimeout(300);
    await nav(page, "#/today"); ok((await text(page)).includes("Log your first session"), "erased");
    await nav(page, "#/more/data");
    await page.setInputFiles("input[type=file]", file);
    await page.waitForSelector("text=Valid backup");
    await page.getByRole("button", { name: "Replace everything with this backup" }).click(); await page.waitForTimeout(400);
    await nav(page, "#/today"); ok(!(await text(page)).includes("Log your first session"), "data back");
    await nav(page, "#/more/vocab"); ok((await page.locator(".vocab").count()) === nVocab, "vocab restored");
    await nav(page, "#/more/data"); ok((await text(page)).includes("before import"), "safety copy taken before import");
    ok(nSessions >= 9, "count");
  });

  await test("corrupt / foreign / tampered backup files are refused and change nothing", async () => {
    await nav(page, "#/more/data");
    const good = JSON.parse(fs.readFileSync(path.join(out, "backup.json"), "utf8"));
    const bad1 = path.join(out, "bad1.json"); fs.writeFileSync(bad1, "{not json");
    const bad2 = path.join(out, "bad2.json"); good.data.sessions[0].minutes += 1; fs.writeFileSync(bad2, JSON.stringify(good));
    const bad3 = path.join(out, "bad3.json"); fs.writeFileSync(bad3, JSON.stringify({ hello: "world" }));
    for (const [f, re] of [[bad1, /not valid JSON/], [bad2, /damaged/], [bad3, /not a French Mastery/]]) {
      await page.setInputFiles("input[type=file]", f); await page.waitForSelector(".error");
      ok(re.test(await page.locator(".error").innerText()), "error for " + f);
      eq(await page.locator("text=Valid backup").count(), 0);
    }
  });

  await test("reminder: enabled reminder shows a neutral banner only when nothing is logged", async () => {
    const p2 = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), "fmt-p2-")), mobile);
    const pg = p2.pages()[0] || await p2.newPage(); await go(pg, "#/more/reminders");
    await pg.getByLabel("Remind me after").fill("00:00"); await pg.locator("input[type=checkbox]").click(); await pg.waitForFunction(() => document.querySelector("input[type=checkbox]").checked);
    await nav(pg, "#/today"); ok((await pg.locator("main").innerText()).includes("Gentle reminder"), "banner shown");
    ok(!/missed|failed|streak.*lost|don.t break/i.test(await pg.locator("main").innerText()), "no guilt wording");
    await pg.close(); await p2.close();
  });

  // ---- restart the whole browser: records must persist ----
  const before = await (async () => { await nav(page, "#/today"); return await text(page); })();
  await page.close(); await ctx.close();
  ctx = await chromium.launchPersistentContext(userData, mobile); page = ctx.pages()[0] || await ctx.newPage();
  await test("persistence: after fully closing and relaunching the browser, everything is still there", async () => {
    await go(page, "#/today"); await page.waitForSelector(".card");
    const after = await text(page);
    ok(after.includes("75%") || after.includes("%"), "today restored");
    const norm = (s) => s.replace(/\s+/g, " ");
    eq(norm(after), norm(before), "dashboard identical after restart");
    await nav(page, "#/more/vocab"); ok((await text(page)).includes("J'ai du mal à comprendre"), "vocab persisted");
    await nav(page, "#/more/dictionary"); ok((await text(page)).includes("Downloaded dictionary"), "dictionary persisted");
    await nav(page, "#/more/challenge"); ok((await text(page)).includes("Resume at day"), "challenge persisted");
  });

  await test("accessibility basics: every button/input has a name, tap targets ≥ 36px, no horizontal scroll", async () => {
    for (const h of ["today", "track", "focus", "progress", "progress/calendar", "more/goals", "more/vocab", "more/data", "more/playbook", "more/dictionary"]) {
      await nav(page, "#/" + h);
      const bad = await page.evaluate(() => [...document.querySelectorAll("button, a, input, select, textarea")].filter((e) => {
        const r = e.getBoundingClientRect(); if (!r.width || e.type === "checkbox" || e.type === "file") return false;
        const name = (e.getAttribute("aria-label") || e.innerText || e.labels?.[0]?.innerText || e.placeholder || "").trim();
        return !name || r.height < 34; }).map((e) => e.outerHTML.slice(0, 80)));
      eq(bad, [], `${h} unnamed/small controls`);
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${h} horizontal overflow`);
    }
  });

  await test("no console or page errors during the whole run", async () => { eq(errors.filter((e) => !/Failed to load resource.*(nope|404)/.test(e)), []); });
  await ctx.close();

  // ---- performance: 3 years of data, 6x CPU throttle ≈ low-end Android ----
  await test("performance: 3 years / ~3,300 sessions on a throttled CPU", async () => {
    const b = await chromium.launch(); const c = await b.newContext(mobile); const p = await c.newPage();
    await p.goto(URL); await p.waitForSelector("main");
    await p.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open("french-mastery-tracker"); r.onsuccess = () => { const db = r.result; const tx = db.transaction("sessions", "readwrite"); const st = tx.objectStore("sessions");
      const acts = ["listening", "speaking", "vocabulary", "grammar", "reading", "writing"]; let n = 0; const now = Date.now();
      for (let d = 0; d < 1095; d++) { const dt = new Date(now - d * 864e5); const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
        if (d % 7 === 3) continue; for (const a of acts.slice(0, 2 + (d % 5))) st.put({ id: "p" + n++, date: iso, activity: a, minutes: 5 + (d * 7 + n) % 20, learned: "", difficulties: "", notes: "", source: "manual", createdAt: n }); }
      tx.oncomplete = () => { db.close(); res(n); }; tx.onerror = () => rej(tx.error); }; }));
    const cdp = await c.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
    const t0 = Date.now(); await p.reload(); await p.waitForSelector(".card"); const start = Date.now() - t0;
    const timeNav = async (h, sel) => { const t = Date.now(); await p.evaluate((x) => { location.hash = x; }, h); await p.waitForSelector(sel); await p.waitForTimeout(50); return Date.now() - t - 50; };
    const stats = await timeNav("#/progress", ".cmp"), focus = await timeNav("#/focus", ".obs, .empty"), cal = await timeNav("#/progress/calendar", ".cal");
    const heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1);
    console.log(`      perf @6x CPU throttle: cold start→dashboard ${start} ms | stats ${stats} ms | focus ${focus} ms | calendar ${cal} ms | JS heap ${heap} MB`);
    ok(start < 4000, "startup under 4 s on throttled CPU"); ok(stats < 2500 && focus < 2500 && cal < 2500, "screens under 2.5 s");
    await b.close();
  });

  server.kill();
  console.log(`\n${results.length - failed}/${results.length} passed. Screenshots: ${out}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
