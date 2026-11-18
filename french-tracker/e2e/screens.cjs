// Visual QA: seeds ~6 weeks of realistic data, then screenshots every screen. Usage: node e2e/screens.cjs <outDir>
const { chromium } = require("playwright"); const { spawn } = require("child_process"); const fs = require("fs"); const path = require("path");
const out = process.argv[2] || "shots"; fs.mkdirSync(out, { recursive: true });
const root = path.join(__dirname, "..");
(async () => {
  const srv = spawn("npx", ["vite", "preview", "--port", "4176", "--strictPort", "--host", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 2500));
  const b = await chromium.launch(); const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await c.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
  await p.goto("http://127.0.0.1:4176/"); await p.waitForSelector("main");
  await p.evaluate(() => new Promise((res, rej) => {
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
    const r = indexedDB.open("french-mastery-tracker");
    r.onsuccess = () => {
      const db = r.result; const tx = db.transaction(["sessions", "vocab", "goals", "challenges"], "readwrite"); let n = 0;
      const S = (date, activity, minutes, extra = {}) => tx.objectStore("sessions").put({ id: "s" + n++, date, activity, minutes, learned: "", difficulties: "", notes: "", source: "manual", createdAt: n, ...extra });
      for (let d = 41; d >= 1; d--) {
        if (d >= 8 && d <= 11) continue; // a 4-day stop
        if (d % 7 === 5 && d > 20) continue; // occasional rest day
        const wk = (new Date(Date.now() - d * 864e5).getDay() + 6) % 7;
        S(ago(d), "listening", d % 3 === 0 ? 14 : 20);
        if (wk < 5) S(ago(d), "vocabulary", d % 4 === 0 ? 8 : 15);
        if (d % 2 === 0) S(ago(d), "reading", 10);
        if (d % 5 === 0) S(ago(d), "writing", 6);
        if (d % 9 === 0) S(ago(d), "speaking", 10);
        if (d % 6 === 0) S(ago(d), "grammar", 10);
        if (d % 4 === 1) S(ago(d), "shadowing", 8, { learned: "Rythme des phrases courtes" });
      }
      S(ago(0), "listening", 20, { learned: "Les liaisons après « les »", difficulties: "Vitesse du podcast" }); S(ago(0), "vocabulary", 8);
      const V = (fr, en, ex, status, added, reviews) => tx.objectStore("vocab").put({ id: "v" + n++, fr, en, example: ex, notes: "", addedAt: ago(added), status, reviews: reviews.map(ago), source: "manual" });
      V("avoir hâte de", "to look forward to", "J'ai hâte de partir.", "learning", 12, [11, 8]); V("du coup", "so; as a result", "Du coup, on reste.", "learning", 9, [8]);
      V("en fait", "actually", "En fait, je n'ai pas le temps.", "learning", 6, []); V("ça dépend", "it depends", "Ça dépend du prix.", "learning", 3, [2]);
      V("j'en ai marre", "I'm fed up", "", "learning", 14, [13, 10, 3]); V("bref", "in short", "Bref, c'était long.", "learned", 30, [29, 26, 19, 5]);
      V("par contre", "on the other hand", "", "learning", 2, []); V("d'ailleurs", "by the way", "", "learning", 20, [19, 16, 9]);
      const G = (title, kind, activity, target, extra = {}) => tx.objectStore("goals").put({ id: "g" + n++, title, kind, activity, target, startDate: ago(40), manualCount: 0, vocabStatus: "any", createdAt: n, ...extra });
      G("20 hours of listening", "minutes", "listening", 1200); G("Speak 30 days in a row", "streak", "speaking", 30); G("Learn 100 expressions", "vocab", "any", 100); G("Read 20 French articles", "counter", "any", 20, { manualCount: 6 });
      const days = {}; for (let i = 1; i <= 8; i++) if (i !== 4) days[i] = { done: true, doneOn: ago(13 - i), objectives: [true, true, i % 2 === 0], note: i === 2 ? "Parler de ma journée était plus facile." : "" };
      tx.objectStore("challenges").put({ id: "c1", name: "30-day challenge", startDate: ago(12), createdAt: Date.now(), days });
      tx.oncomplete = () => { db.close(); res(); }; tx.onerror = () => rej(tx.error);
    };
  }));
  const shot = async (name, hash, setup, full = true) => { await p.goto("http://127.0.0.1:4176/#/" + hash); await p.reload(); await p.waitForSelector("main"); await p.waitForTimeout(350); if (setup) await setup(); await p.screenshot({ path: path.join(out, name + ".png"), fullPage: full }); };
  await shot("01-today", "today");
  await shot("02-track", "track");
  await shot("03-focus", "focus");
  await shot("04-stats", "progress");
  await shot("05-calendar", "progress/calendar");
  await shot("06-more", "more");
  await shot("07-playbook", "more/playbook");
  await shot("08-dict-words", "more/dictionary", async () => { await p.getByLabel("Search the dictionary").fill("fatig"); await p.waitForTimeout(400); });
  await shot("09-dict-english", "more/dictionary", async () => { await p.getByLabel("Search the dictionary").fill("kitchen"); await p.waitForTimeout(400); });
  await shot("10-phrasebook", "more/dictionary", async () => { await p.getByRole("tab", { name: "Phrasebook" }).click(); await p.getByRole("button", { name: "Café & restaurant" }).click(); });
  await shot("11-vocab", "more/vocab");
  await shot("12-goals", "more/goals");
  await shot("13-challenge", "more/challenge");
  await shot("14-sheet", "track", async () => { await p.locator(".act").nth(1).getByRole("button", { name: "＋ Add minutes" }).click(); await p.waitForTimeout(200); }, false);
  console.log("errors:", errs); await b.close(); srv.kill();
})();
