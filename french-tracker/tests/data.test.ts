import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { Db } from "../src/lib/db";
import { createBackup, restoreBackup, takeSnapshot, validateBackup } from "../src/lib/backup";
import { DictError, downloadPack, installBundled, installPack, isPhrase, rebuildPhrases, searchPhraseDict, normalize, removeDictionary, searchDict, type Manifest } from "../src/lib/dict";
import { defaultSettings, uid, type VocabEntry } from "../src/lib/model";
import { convertEntry } from "../tools/build-pack.mjs";
import { s } from "./helpers";

let n = 0;
const open = () => Db.open(`t-${++n}-${Math.random()}`);

describe("local database persistence", () => {
  it("records survive closing and reopening the database (app restart)", async () => {
    const name = `persist-${Math.random()}`;
    let db = await Db.open(name);
    await db.put("sessions", s("2026-11-17", "listening", 12));
    await db.put("vocab", { id: "v1", fr: "bonjour", en: "hello" });
    await db.saveSettings({ ...defaultSettings(), dictUrl: "x" });
    db.close();
    db = await Db.open(name);
    expect(await db.getAll("sessions")).toHaveLength(1);
    expect((await db.getAll<any>("sessions"))[0].minutes).toBe(12);
    expect((await db.getAll<any>("vocab"))[0].fr).toBe("bonjour");
    expect((await db.loadSettings()).dictUrl).toBe("x");
  });
  it("loads defaults on a fresh install", async () => {
    const db = await open();
    expect((await db.loadSettings()).targetHistory[0]!.targets.listening).toBe(20);
  });
});

describe("backup and restore", () => {
  it("round-trips everything and restores into an empty database", async () => {
    const a = await open();
    await a.putMany("sessions", [s("2026-11-01", "reading", 10), s("2026-11-02", "writing", 5)]);
    await a.put("marks", { key: "2026-11-02|writing", date: "2026-11-02", activity: "writing" });
    const v: VocabEntry = { id: uid(), fr: "être", en: "to be", example: "", notes: "", addedAt: "2026-11-02", status: "learning", reviews: ["2026-11-05"], source: "manual" };
    await a.put("vocab", v);
    const file = JSON.parse(JSON.stringify(await createBackup(a))); // as if saved to disk
    const b = await open();
    await restoreBackup(b, file, "replace");
    expect((await b.getAll("sessions")).length).toBe(2);
    expect(await b.getAll("marks")).toHaveLength(1);
    expect((await b.getAll<VocabEntry>("vocab"))[0]).toEqual(v);
  });
  it("replace takes a safety snapshot first and the old data can be recovered", async () => {
    const db = await open();
    await db.put("sessions", s("2026-11-01", "reading", 10));
    const other = await open();
    await other.put("sessions", s("2026-11-09", "writing", 99));
    await restoreBackup(db, await createBackup(other), "replace");
    const snaps = await db.getAll<any>("snapshots");
    expect(snaps).toHaveLength(1);
    expect(snaps[0].backup.data.sessions[0].minutes).toBe(10); // the data that was replaced
    await restoreBackup(db, snaps[0].backup, "replace");
    expect((await db.getAll<any>("sessions"))[0].minutes).toBe(10);
  });
  it("merge adds new records and never overwrites existing ones", async () => {
    const db = await open();
    const mine = s("2026-11-01", "reading", 10);
    await db.put("sessions", mine);
    const other = await open();
    await other.putMany("sessions", [{ ...mine, minutes: 999 }, s("2026-11-02", "writing", 5)]);
    await restoreBackup(db, await createBackup(other), "merge");
    const all = await db.getAll<any>("sessions");
    expect(all).toHaveLength(2);
    expect(all.find((x) => x.id === mine.id).minutes).toBe(10);
  });
  it("rejects tampered, foreign or invalid files and leaves data untouched", async () => {
    const db = await open();
    await db.put("sessions", s("2026-11-01", "reading", 10));
    const good = JSON.parse(JSON.stringify(await createBackup(db)));
    const tampered = structuredClone(good); tampered.data.sessions[0].minutes = 500;
    await expect(validateBackup(tampered)).rejects.toThrow(/damaged/);
    await expect(validateBackup({ hello: 1 })).rejects.toThrow(/not a French Mastery/);
    await expect(validateBackup(null)).rejects.toThrow();
    const bad = structuredClone(good); bad.data.sessions[0].date = "2026-13-45";
    await expect(restoreBackup(db, bad, "replace")).rejects.toThrow();
    expect((await db.getAll<any>("sessions"))[0].minutes).toBe(10);
  });
  it("keeps only the 5 newest snapshots", async () => {
    const db = await open();
    for (let i = 0; i < 7; i++) await takeSnapshot(db, `r${i}`);
    expect(await db.count("snapshots")).toBe(5);
  });
});

// ---- Dictionary: a TEST FIXTURE written for these tests (our own wording), not real dictionary data. ----
const FIXTURE = [
  { w: "chat", p: "noun", g: "m", ipa: "/ʃa/", d: [{ t: "cat", l: "en" }], x: [{ f: "Le chat dort.", e: "The cat sleeps." }] },
  { w: "château", p: "noun", g: "m", d: [{ t: "castle", l: "en" }] },
  { w: "être", p: "verb", d: [{ t: "to be", l: "en" }] },
  { w: "œuf", p: "noun", g: "m", d: [{ t: "egg", l: "en" }] },
  { w: "maison", p: "noun", g: "f", d: [{ t: "house", l: "en" }] },
];
const packBytes = gzipSync(Buffer.from(FIXTURE.map((e) => JSON.stringify(e)).join("\n") + "\n"));
const manifest = (over: Partial<Manifest> = {}): Manifest => ({
  version: "test", file: "fr-en.jsonl.gz", size: packBytes.length, sha256: createHash("sha256").update(packBytes).digest("hex"),
  count: FIXTURE.length, license: "test fixture", source: "unit test", ...over,
});

describe("dictionary", () => {
  it("normalises accents, ligatures and case", () => {
    expect(normalize("  Château ")).toBe("chateau"); expect(normalize("ŒUF")).toBe("oeuf"); expect(normalize("l’eau")).toBe("l'eau");
  });
  it("installs a pack and searches it with no network at all", async () => {
    const db = await open();
    const orig = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error("NETWORK USED"); }) as any; // prove searching is offline
    try {
      await installPack(db, new Blob([packBytes]), manifest(), "u");
      expect((await db.loadSettings()).dict).toMatchObject({ installed: true, count: 5 });
      const r = await searchDict(db, "chat");
      expect(r[0]).toMatchObject({ w: "chat", g: "m", ipa: "/ʃa/" }); expect(r[0]!.d[0]!.t).toBe("cat"); expect(r[0]!.x![0]!.e).toBe("The cat sleeps.");
      expect(r.map((e) => e.w)).toEqual(["chat", "château"]);                     // exact first, then prefix
      expect((await searchDict(db, "CHATEAU"))[0]!.w).toBe("château");             // accent-insensitive
      expect((await searchDict(db, "oeuf"))[0]!.w).toBe("œuf");                    // ligature
      expect(await searchDict(db, "zzzz")).toEqual([]);
      expect(await searchDict(db, "   ")).toEqual([]);
    } finally { globalThis.fetch = orig; }
  });
  it("refuses a pack whose entry count does not match and leaves no half-installed dictionary", async () => {
    const db = await open();
    await expect(installPack(db, new Blob([packBytes]), manifest({ count: 99 }), "u")).rejects.toThrow(/count mismatch/);
    expect(await db.count("dict")).toBe(0); expect((await db.loadSettings()).dict).toBeNull();
  });
  it("removes the dictionary but never the user's vocabulary", async () => {
    const db = await open();
    await db.put("vocab", { id: "v", fr: "chat" });
    await installPack(db, new Blob([packBytes]), manifest(), "u");
    await removeDictionary(db);
    expect(await db.count("dict")).toBe(0); expect(await db.count("vocab")).toBe(1);
  });

  describe("download over HTTP", () => {
    let server: http.Server, base = "", cut = false, corrupt = false, requests: string[] = [];
    beforeAll(async () => {
      server = http.createServer((req, res) => {
        requests.push(`${req.method} ${req.url} ${req.headers.range ?? ""}`);
        if (req.url === "/manifest.json") { res.setHeader("content-type", "application/json"); return void res.end(JSON.stringify(corrupt ? manifest({ sha256: "0".repeat(64) }) : manifest())); }
        if (req.url === "/enc.json") { res.setHeader("content-type", "application/json"); return void res.end(JSON.stringify(manifest({ file: "enc.gz" }))); }
        if (req.url === "/enc.gz") {
          if (req.method === "HEAD") { res.setHeader("content-length", packBytes.length); return void res.end(); }
          res.setHeader("content-encoding", "gzip"); return void res.end(packBytes);
        }
        if (req.url === "/fr-en.jsonl.gz") {
          const m = /bytes=(\d+)-/.exec(req.headers.range ?? "");
          const start = m ? Number(m[1]) : 0;
          res.setHeader("accept-ranges", "bytes");
          if (req.method === "HEAD") { res.setHeader("content-length", packBytes.length); return void res.end(); }
          const body = packBytes.subarray(start);
          if (m) { res.statusCode = 206; res.setHeader("content-range", `bytes ${start}-${packBytes.length - 1}/${packBytes.length}`); }
          res.setHeader("content-length", body.length);
          if (cut && !m) { res.write(body.subarray(0, 40)); return void setTimeout(() => res.destroy(), 10); } // drop mid-transfer
          return void res.end(body);
        }
        res.statusCode = 404; res.end();
      });
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      base = `http://127.0.0.1:${(server.address() as any).port}`;
    });
    afterAll(() => server.close());

    it("downloads, verifies the checksum and installs", async () => {
      const db = await open(); const phases = new Set<string>();
      const meta = await downloadPack(db, `${base}/manifest.json`, (p) => phases.add(p.phase));
      expect(meta.count).toBe(5); expect([...phases]).toEqual(["download", "verify", "install"]);
      expect((await searchDict(db, "maison"))[0]!.g).toBe("f");
      expect(await db.count("partial")).toBe(0);
    });
    it("an interrupted download keeps its progress and resumes with a Range request", async () => {
      const db = await open(); requests = []; cut = true;
      await expect(downloadPack(db, `${base}/manifest.json`, () => {})).rejects.toThrow(/resume/);
      const part = await db.get<any>("partial", "pack");
      expect(part.received).toBeGreaterThan(0); expect(part.received).toBeLessThan(packBytes.length);
      expect(await db.count("dict")).toBe(0);               // nothing half-installed
      cut = false; requests = [];
      const meta = await downloadPack(db, `${base}/manifest.json`, () => {});
      expect(meta.installed).toBe(true);
      expect(requests.some((r) => r.startsWith("GET /fr-en.jsonl.gz bytes="))).toBe(true);
      expect((await searchDict(db, "etre"))[0]!.w).toBe("être");
    });
    it("a corrupted download is rejected, discarded, and the existing dictionary stays usable", async () => {
      const db = await open();
      await installPack(db, new Blob([packBytes]), manifest(), "u");
      corrupt = true;
      await expect(downloadPack(db, `${base}/manifest.json`, () => {})).rejects.toThrow(/verification/);
      corrupt = false;
      expect(await db.count("partial")).toBe(0);
      expect((await searchDict(db, "chat"))[0]!.w).toBe("chat");
    });
    it("refuses (with a clear reason) a server that re-encodes the file, instead of failing verification mysteriously", async () => {
      const db = await open();
      await expect(downloadPack(db, `${base}/enc.json`, () => {})).rejects.toThrow(/compresses the file in transit/);
      expect(await db.count("dict")).toBe(0);
    });
    it("installs a pack bundled inside the app with plain GETs, verifies it, and skips when already installed", async () => {
      const db = await open();
      const meta = await installBundled(db, `${base}/manifest.json`);
      expect(meta).toMatchObject({ installed: true, count: 5 });
      expect((await searchDict(db, "chateau"))[0]!.w).toBe("château");
      expect(await installBundled(db, `${base}/manifest.json`)).toBeNull();        // same version -> nothing to do
      expect(await installBundled(await open(), `${base}/absent.json`)).toBeNull(); // no bundled pack -> silently nothing
    });
    it("rejects a corrupted bundled pack and leaves no half-installed dictionary", async () => {
      const db = await open(); corrupt = true;
      await expect(installBundled(db, `${base}/manifest.json`)).rejects.toThrow(/checksum/);
      corrupt = false; expect(await db.count("dict")).toBe(0);
    });
    it("shows a clear error when no pack is published or the server is unreachable", async () => {
      const db = await open();
      await expect(downloadPack(db, `${base}/nope.json`, () => {})).rejects.toThrow(/No dictionary pack is published/);
      await expect(downloadPack(db, "http://127.0.0.1:1/manifest.json", () => {})).rejects.toBeInstanceOf(DictError);
    });
  });

  it("pack builder skips inflected forms, alternative spellings and empty entries", () => {
    expect(convertEntry({ word: "chats", lang_code: "fr", senses: [{ glosses: ["plural of chat"], form_of: [{ word: "chat" }], tags: ["form-of", "plural"] }] }, "en")).toBeNull();
    expect(convertEntry({ word: "chatt", lang_code: "fr", senses: [{ glosses: ["misspelling of chat"], tags: ["misspelling"] }] }, "en")).toBeNull();
    const mixed = convertEntry({ word: "avocat", lang_code: "fr", pos: "noun", senses: [{ glosses: ["lawyer"], tags: ["masculine"] }, { glosses: ["old form"], tags: ["obsolete"] }] }, "en");
    expect(mixed!.d).toEqual([{ t: "lawyer", l: "en" }]);
  });
  it("pack builder converts Kaikki-shaped entries (gender, IPA, examples)", () => {
    const e = convertEntry({ word: "chat", lang_code: "fr", pos: "noun", sounds: [{ ipa: "/ʃa/" }],
      senses: [{ glosses: ["cat"], tags: ["masculine"], examples: [{ text: "Le chat dort.", english: "The cat sleeps." }] }] }, "en");
    expect(e).toEqual({ w: "chat", p: "noun", g: "m", ipa: "/ʃa/", d: [{ t: "cat", l: "en" }], x: [{ f: "Le chat dort.", e: "The cat sleeps." }] });
    expect(convertEntry({ word: "x", lang_code: "en", senses: [{ glosses: ["a"] }] }, "en")).toBeNull();
    expect(convertEntry({ word: "form", lang_code: "fr", senses: [] }, "en")).toBeNull();
    expect(convertEntry({ word: "ami", lang_code: "fr", head_templates: [{ expansion: "ami m (plural amis)" }], senses: [{ glosses: ["friend"] }] }, "en")!.g).toBe("m");
  });
});

import { verify } from "../tools/verify-pack.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
describe("pack verifier (used in CI against the real downloaded data)", () => {
  const dir = mkdtempSync(`${tmpdir()}/pack-`);
  writeFileSync(`${dir}/fr-en.pack`, packBytes);
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest({ file: "fr-en.pack" })));
  it("passes when the well-known words are present with the right gender and meaning", () => {
    const r = verify(dir, "chat:m:cat,maison:f:house,être::be,œuf:m:egg");
    expect(r.problems).toEqual([]); expect(r.stats.entries).toBe(5);
  });
  it("fails on missing words, wrong gender, wrong meaning, and a tampered file", () => {
    const r = verify(dir, "chat:f:cat,maison:f:castle,zzz");
    expect(r.problems.join("|")).toMatch(/chat: expected gender f/); expect(r.problems.join("|")).toMatch(/maison: no meaning containing "castle"/); expect(r.problems.join("|")).toMatch(/missing word: zzz/);
    writeFileSync(`${dir}/fr-en.pack`, Buffer.concat([packBytes, Buffer.from([0])]));
    expect(verify(dir, "").problems.join("|")).toMatch(/size|sha256|Error/);
  });
});


describe("dictionary phrases (multi-word entries)", () => {
  const entries = [
    { w: "avoir hâte", p: "verb", d: [{ t: "to look forward to", l: "en" }], x: [{ f: "J'ai hâte de partir.", e: "I can't wait to leave." }] },
    { w: "pomme de terre", p: "noun", g: "f", d: [{ t: "potato", l: "en" }] },
    { w: "du coup", p: "adv", d: [{ t: "so; as a result", l: "en" }] },
    { w: "Jean Dupont", p: "name", d: [{ t: "a common name", l: "en" }] },   // proper noun: not a phrase
    { w: "chat", p: "noun", g: "m", d: [{ t: "cat", l: "en" }] },
  ];
  const bytes = gzipSync(Buffer.from(entries.map((e) => JSON.stringify(e)).join("\n") + "\n"));
  const man = (): Manifest => ({ version: "p", file: "x.pack", size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), count: entries.length, license: "t", source: "t" });
  it("classifies multi-word headwords as phrases, but not single words or proper names", () => {
    expect(entries.filter(isPhrase).map((e) => e.w)).toEqual(["avoir hâte", "pomme de terre", "du coup"]);
  });
  it("install fills the phrases store; search matches French (prefix/contains) and English meanings, accent-insensitive", async () => {
    const db = await open(); await installPack(db, new Blob([bytes]), man(), "u");
    expect(await db.count("phrases")).toBe(3);
    expect((await searchPhraseDict(db, "avoir hate"))[0]!.w).toBe("avoir hâte");          // accent-insensitive
    expect((await searchPhraseDict(db, "terre")).map((e) => e.w)).toEqual(["pomme de terre"]); // contains
    expect((await searchPhraseDict(db, "look forward"))[0]!.w).toBe("avoir hâte");          // by English meaning
    expect((await searchPhraseDict(db, "potato"))[0]!.w).toBe("pomme de terre");
    expect(await searchPhraseDict(db, "jean")).toEqual([]); expect(await searchPhraseDict(db, "a")).toEqual([]);
    expect(await searchPhraseDict(db, "chat")).toEqual([]);                                   // single words are not phrases
  });
  it("removing the dictionary removes its phrases too", async () => {
    const db = await open(); await installPack(db, new Blob([bytes]), man(), "u"); await removeDictionary(db);
    expect(await db.count("phrases")).toBe(0);
  });
  it("upgrades an existing v1 database without losing data, and rebuilds phrases from the installed dictionary", async () => {
    const name = `v1-${Math.random()}`;
    await new Promise<void>((res, rej) => {   // a database exactly as the previous app version created it
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("sessions", { keyPath: "id" }).createIndex("date", "date"); for (const s of ["marks", "vocab", "goals", "challenges", "snapshots", "kv"]) d.createObjectStore(s, { keyPath: s === "marks" ? "key" : s === "kv" ? "key" : "id" }); d.createObjectStore("dict", { autoIncrement: true }).createIndex("k", "k"); d.createObjectStore("partial", { keyPath: "key" }); };
      r.onsuccess = () => { const d = r.result; const tx = d.transaction(["sessions", "dict"], "readwrite");
        tx.objectStore("sessions").put({ id: "keep", date: "2026-11-01", activity: "reading", minutes: 7 });
        tx.objectStore("dict").put({ k: "pomme de terre", w: "pomme de terre", p: "noun", d: [{ t: "potato", l: "en" }] });
        tx.objectStore("dict").put({ k: "chat", w: "chat", p: "noun", d: [{ t: "cat", l: "en" }] });
        tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error);
    });
    const db = await Db.open(name);
    expect((await db.getAll<any>("sessions"))[0].minutes).toBe(7);          // data survived the upgrade
    expect(await db.count("phrases")).toBe(0);
    expect(await rebuildPhrases(db)).toBe(1);                               // only the multi-word entry
    expect((await searchPhraseDict(db, "potato"))[0]!.w).toBe("pomme de terre");
    expect(await rebuildPhrases(db)).toBe(0);                               // idempotent
  });
});

describe("word formation, related words and inflected forms", () => {
  const raw = {
    word: "chanter", lang_code: "fr", pos: "verb", etymology_text: "From Latin cantāre,   frequentative of canere.",
    senses: [{ glosses: ["to sing"], synonyms: [{ word: "fredonner" }] }],
    derived: [{ word: "chanteur" }, { word: "chanson" }, { word: "chanteur" }, { word: "chanter" }],   // duplicate + itself
    related: [{ word: "chant" }], antonyms: [{ word: "se taire" }],
    forms: [
      { form: "chantons", tags: ["first-person", "plural", "present", "indicative"] }, { form: "chanté", tags: ["participle", "past"] },
      { form: "chantons", tags: ["first-person", "plural", "present", "indicative"] },                 // duplicate
      { form: "no-table-tags", source: "conjugation" }, { form: "fr-conj-er", tags: ["inflection-template"] }, { form: "chanter", tags: ["infinitive"] },
    ],
  };
  it("builder extracts etymology (whitespace cleaned), derived, related, synonyms, antonyms and forms; drops junk, duplicates and self-references", () => {
    const e = convertEntry(raw, "en")!;
    expect(e.et).toBe("From Latin cantāre, frequentative of canere.");
    expect(e.dv).toEqual(["chanteur", "chanson"]); expect(e.rl).toEqual(["chant"]);
    expect(e.sy).toEqual(["fredonner"]); expect(e.an).toEqual(["se taire"]);
    expect(e.fm).toEqual(["chantons|first-person plural present indicative", "chanté|participle past"]);
  });
  it("entries without those fields stay lean (no empty arrays)", () => {
    const e = convertEntry({ word: "x", lang_code: "fr", senses: [{ glosses: ["a"] }] }, "en") as any;
    expect(Object.keys(e).sort()).toEqual(["d", "w"]);
  });

  const lines = [convertEntry(raw, "en"), convertEntry({ word: "chanson", lang_code: "fr", pos: "noun", etymology_text: "From Old French chançon.", senses: [{ glosses: ["song"], tags: ["feminine"] }] }, "en")];
  const pk = gzipSync(Buffer.from(lines.map((e) => JSON.stringify(e)).join("\n") + "\n"));
  const mf = (): Manifest => ({ version: "f", file: "x.pack", size: pk.length, sha256: createHash("sha256").update(pk).digest("hex"), count: 2, license: "t", source: "t" });
  it("searching an inflected form (accent/case-insensitive) returns the base word with the kind of form; forms are not separate entries", async () => {
    const db = await open(); await installPack(db, new Blob([pk]), mf(), "u");
    expect(await db.count("dict")).toBe(2);
    const r = await searchDict(db, "CHANTÉ");
    expect(r[0]).toMatchObject({ w: "chanter", matched: { form: "chanté", tags: "participle past" } });
    expect((await searchDict(db, "chantons"))[0]!.matched).toEqual({ form: "chantons", tags: "first-person plural present indicative" });
    const base = (await searchDict(db, "chanter"))[0]!;
    expect(base.matched).toBeUndefined(); expect(base.et).toMatch(/Latin/); expect(base.dv).toContain("chanson");
    expect((await searchDict(db, "chanson")).filter((e) => e.w === "chanson").length).toBe(1);   // no duplicate via forms
  });
  it("keeps homographs that share word and part of speech (livre: book m / pound f), and does not duplicate form matches", async () => {
    const hs = [{ w: "livre", p: "noun", g: "m", d: [{ t: "book", l: "en" }], fm: ["livres|plural"] }, { w: "livre", p: "noun", g: "f", d: [{ t: "pound", l: "en" }], fm: ["livres|plural"] }];
    const bytes2 = gzipSync(Buffer.from(hs.map((e) => JSON.stringify(e)).join("\n") + "\n"));
    const db = await open(); await installPack(db, new Blob([bytes2]), { version: "h", file: "x", size: bytes2.length, sha256: createHash("sha256").update(bytes2).digest("hex"), count: 2, license: "t", source: "t" }, "u");
    expect((await searchDict(db, "livre")).map((e) => e.d[0]!.t).sort()).toEqual(["book", "pound"]);
    const viaForm = await searchDict(db, "livres");
    expect(viaForm.map((e) => e.d[0]!.t).sort()).toEqual(["book", "pound"]); expect(viaForm.every((e) => e.matched?.form === "livres")).toBe(true);
  });
  it("upgrades a v2 database to v3 (adds the forms index) without losing the dictionary or user data", async () => {
    const name = `v2-${Math.random()}`;
    await new Promise<void>((res, rej) => {
      const r = indexedDB.open(name, 2);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("sessions", { keyPath: "id" }); for (const s of ["marks", "vocab", "goals", "challenges", "snapshots", "kv", "partial"]) d.createObjectStore(s, { keyPath: s === "marks" || s === "kv" || s === "partial" ? "key" : "id" }); d.createObjectStore("dict", { autoIncrement: true }).createIndex("k", "k"); d.createObjectStore("phrases", { autoIncrement: true }); };
      r.onsuccess = () => { const d = r.result; const tx = d.transaction(["sessions", "dict"], "readwrite"); tx.objectStore("sessions").put({ id: "keep", minutes: 9 }); tx.objectStore("dict").put({ k: "chat", w: "chat", d: [{ t: "cat", l: "en" }] }); tx.oncomplete = () => { d.close(); res(); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error);
    });
    const db = await Db.open(name);
    expect((await db.getAll<any>("sessions"))[0].minutes).toBe(9);
    expect((await searchDict(db, "chat"))[0]!.w).toBe("chat");               // old entries still searchable (no forms until re-install)
    expect(db.idb.transaction("dict").objectStore("dict").indexNames.contains("f")).toBe(true);
  });
  it("verifier checks that a verb really lists a given form", () => {
    const dir = mkdtempSync(`${tmpdir()}/pack-f-`); writeFileSync(`${dir}/x.pack`, pk); writeFileSync(`${dir}/manifest.json`, JSON.stringify(mf()));
    expect(verify(dir, "", "chanter:chantons").problems).toEqual([]);
    expect(verify(dir, "", "chanter:chantez").problems.join()).toMatch(/form "chantez" not found/);
    expect((verify(dir, "").stats as any).withEtymologyPct).toBe(100);
  });
});
