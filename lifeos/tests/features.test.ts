import { describe, expect, it } from "vitest";
import { Db } from "../src/lib/db";
import { checkFile, fmtSize, loadAttachment, MAX_FILE_BYTES, removeAttachment, saveAttachment, storageUsed } from "../src/lib/attachments";
import { clearKey, keyInfo, loadKey, saveKey } from "../src/lib/aikey";
import { geminiJson, listModels } from "../src/lib/gemini";
import { askModel, aiStatus, buildBreakdownRequest } from "../src/lib/aiClient";
import { createBackup, restoreBackup, validateBackup } from "../src/lib/backup";
import { validateAi, type GuardContext } from "../src/domain/aiGuard";
import { sessionConflicts, unscheduleSession } from "../src/domain/ops";
import { undoChange } from "../src/domain/reschedule";
import { defaultRules, defaultSettings, type Objective, type Occurrence, type Session } from "../src/lib/model";

let n = 0; const open = () => Db.open(`lifeos-feat-${++n}-${Math.random()}`);
const KEY = "AIzaSyD-FAKEFAKEFAKEFAKEFAKEFAKE1234567";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

describe("attachments", () => {
  it("stores a file on the device, returns the same bytes, counts usage, and removes it", async () => {
    const db = await open(); const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const m = await saveAttachment(db, new File([bytes], "report.pdf", { type: "application/pdf" }));
    expect(m).toMatchObject({ name: "report.pdf", mime: "application/pdf", size: 5 });
    const back = await loadAttachment(db, m.id); expect(new Uint8Array(await back!.blob.arrayBuffer())).toEqual(bytes);
    expect(await storageUsed(db)).toEqual({ count: 1, bytes: 5 });
    await removeAttachment(db, m.id); expect(await loadAttachment(db, m.id)).toBeUndefined();
  });
  it("refuses empty, oversized and executable/script/web-page files with a clear reason", () => {
    expect(checkFile({ name: "a.pdf", size: 0 })).toMatch(/empty/); expect(checkFile({ name: "big.pdf", size: MAX_FILE_BYTES + 1 })).toMatch(/limit is 10\.0 MB/);
    for (const f of ["x.exe", "x.BAT", "run.sh", "evil.js", "page.html", "page.HTM", "setup.msi", "app.apk", "x.ps1"]) expect(checkFile({ name: f, size: 10 }), f).toMatch(/cannot be attached/);
    for (const f of ["scan.pdf", "photo.jpg", "notes.txt", "sheet.xlsx", "cert.png"]) expect(checkFile({ name: f, size: 10 }), f).toBeNull();
    expect(fmtSize(512)).toBe("512 B"); expect(fmtSize(2048)).toBe("2 KB"); expect(fmtSize(5 * 1048576)).toBe("5.0 MB");
  });
  it("sanitises odd file names and surfaces a full device as a friendly error", async () => {
    const db = await open(); const m = await saveAttachment(db, new File([new Uint8Array([1])], "..\\..\\etc/passwd\u0000.txt", { type: "text/plain" }));
    expect(m.name).not.toMatch(/[\\/\u0000]/);
    const full = { put: async () => { throw new DOMException("quota", "QuotaExceededError"); } } as unknown as Db;
    await expect(saveAttachment(full, new File([new Uint8Array([1])], "a.txt"))).rejects.toThrow(/no room for that file/);
    await expect(saveAttachment(db, new File([new Uint8Array([1])], "x.exe"))).rejects.toThrow(/cannot be attached/);
  });
  it("an old (v1) database upgrades to v2 and gains the files store without losing data", async () => {
    const name = `v1-${Math.random()}`;
    await new Promise<void>((res, rej) => { const r = indexedDB.open(name, 1); r.onupgradeneeded = () => { for (const s of ["tasks", "kv"]) r.result.createObjectStore(s, { keyPath: s === "kv" ? "key" : "id" }); }; r.onsuccess = () => { const tx = r.result.transaction("tasks", "readwrite"); tx.objectStore("tasks").put({ id: "keep" }); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); }; });
    const db = await Db.open(name); expect((await db.getAll<{ id: string }>("tasks"))[0]!.id).toBe("keep"); expect(db.idb.objectStoreNames.contains("files")).toBe(true);
  });
});

describe("API key vault", () => {
  it("never stores the key in plain text; round-trips; survives reopening; shows only the last 4 characters", async () => {
    const name = `vault-${Math.random()}`; let db = await Db.open(name);
    await saveKey(db, KEY); expect(await loadKey(db)).toBe(KEY); expect((await keyInfo(db))!.last4).toBe(KEY.slice(-4));
    const raw = JSON.stringify(await new Promise((res) => { const r = db.idb.transaction("kv").objectStore("kv").getAll(); r.onsuccess = () => res(r.result.map((x: { key: string; value: unknown }) => x.key === "deviceKey" ? { key: x.key } : x)); }));
    expect(raw).not.toContain(KEY); expect(raw).not.toContain(KEY.slice(0, 12));
    db.close(); db = await Db.open(name); expect(await loadKey(db)).toBe(KEY);
    await clearKey(db); expect(await loadKey(db)).toBeNull(); expect(await keyInfo(db)).toBeNull();
  });
  it("rejects values that cannot be keys (too short, whitespace)", async () => { const db = await open(); await expect(saveKey(db, "short")).rejects.toThrow(/does not look like an API key/); await expect(saveKey(db, "has space inside the key value here ok")).rejects.toThrow(); });
  it("a different browser profile (no device key) cannot decrypt a copied vault entry", async () => {
    const a = await open(); await saveKey(a, KEY); const entry = await a.getKv<unknown>("aiKey");
    const b = await open(); await b.setKv("aiKey", entry); expect(await loadKey(b)).toBeNull();
  });
  it("the key is excluded from backups and settings, even when attachments are included", async () => {
    const db = await open(); await saveKey(db, KEY); await db.saveSettings({ ...defaultSettings(), geminiModel: "gemini-x" });
    const b = JSON.stringify(await createBackup(db, { attachments: true })); expect(b).not.toContain(KEY); expect(b).not.toContain("deviceKey"); expect(b).not.toContain("aiKey");
  });
});

describe("Gemini client", () => {
  const seen: { url: string; init: RequestInit }[] = [];
  const mock = (handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch => (async (url: string, init: RequestInit) => { seen.push({ url, init }); return handler(url, init); }) as unknown as typeof fetch;
  it("sends the key only in the x-goog-api-key header, never in the URL; lists text models, flash first", async () => {
    seen.length = 0;
    const models = await listModels(KEY, mock(() => json({ models: [{ name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent", "countTokens"] }, { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] }, { name: "models/gemini-embedding-001", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] }, { name: "models/imagen-3", supportedGenerationMethods: ["predict"] }] })));
    expect(models).toEqual(["gemini-2.5-flash", "gemini-2.5-pro"]);
    expect(seen[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200"); expect(seen[0]!.url).not.toContain(KEY);
    expect((seen[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
  });
  it("asks for JSON, with the system prompt separate from the data, and parses fenced or plain answers", async () => {
    seen.length = 0;
    const ok = (text: string) => mock(() => json({ candidates: [{ content: { parts: [{ text }] } }] }));
    expect(await geminiJson({ key: KEY, model: "gemini-2.5-flash", system: "SYS", prompt: "DATA", fetchImpl: ok('{"operations":[]}') })).toEqual({ operations: [] });
    expect(await geminiJson({ key: KEY, model: "gemini-2.5-flash", system: "S", prompt: "P", fetchImpl: ok('```json\n{"a":1}\n```') })).toEqual({ a: 1 });
    const body = JSON.parse(seen[0]!.init.body as string); expect(body.systemInstruction.parts[0].text).toBe("SYSTEM".slice(0, 0) + "SYS"); expect(body.contents[0].parts[0].text).toBe("DATA"); expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(seen[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"); expect(seen[0]!.url).not.toContain(KEY);
  });
  it("explains every failure plainly and never repeats the key, even if the server echoes it", async () => {
    const fail = async (status: number, message: string) => geminiJson({ key: KEY, model: "gemini-2.5-flash", system: "s", prompt: "p", fetchImpl: mock(() => json({ error: { message } }, status)) }).then(() => "no error", (e: Error) => e.message);
    expect(await fail(400, "API key not valid. Please pass a valid API key.")).toMatch(/rejected the key/);
    expect(await fail(403, `Permission denied for key ${KEY}`)).toMatch(/refused this key/); expect(await fail(404, "model not found")).toMatch(/not available to your key/);
    expect(await fail(429, "quota")).toMatch(/rate limit or free quota/);
    const echo = await fail(500, `internal error while using ${KEY}`); expect(echo).toMatch(/HTTP 500/); expect(echo).not.toContain(KEY); expect(echo).toContain("[key]");
  });
  it("handles blocked prompts, empty and non-JSON answers, network failure, timeouts and unsafe model names", async () => {
    const run = (fi: typeof fetch, model = "gemini-2.5-flash", t?: number) => geminiJson({ key: KEY, model, system: "s", prompt: "p", fetchImpl: fi, ...(t ? { timeoutMs: t } : {}) }).then(() => "ok", (e: Error) => e.message);
    expect(await run(mock(() => json({ promptFeedback: { blockReason: "SAFETY" }, candidates: [] })))).toMatch(/declined this request \(safety\)/);
    expect(await run(mock(() => json({ candidates: [] })))).toMatch(/no answer/); expect(await run(mock(() => json({ candidates: [{ content: { parts: [{ text: "Sure! here you go" }] } }] })))).toMatch(/not valid JSON/);
    expect(await run((async () => { throw new TypeError("net"); }) as unknown as typeof fetch)).toMatch(/Could not reach Gemini/);
    expect(await run(((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new Error("x"))))) as unknown as typeof fetch, "gemini-2.5-flash", 20)).toMatch(/did not answer in time/);
    for (const bad of ["", "../../admin", "a/b", "model?key=x", "x:generate"]) expect(await run(mock(() => json({})), bad), bad).toMatch(/Choose a model/);
  });
  it("askModel uses the saved key and chosen model; aiStatus says exactly what is missing", async () => {
    const db = await open(); const s = { ...defaultSettings(), aiProvider: "gemini" as const };
    expect((await aiStatus(db, s)).why).toMatch(/Paste your Gemini API key/); await saveKey(db, KEY); expect((await aiStatus(db, s)).why).toMatch(/Choose a Gemini model/);
    const ready = { ...s, geminiModel: "gemini-2.5-flash" }; expect((await aiStatus(db, ready)).ready).toBe(true);
    seen.length = 0; const out = await askModel(db, ready, { hello: 1 }, mock(() => json({ candidates: [{ content: { parts: [{ text: '{"operations":[{"op":"advice","text":"hi"}]}' }] } }] })));
    expect(out).toEqual({ operations: [{ op: "advice", text: "hi" }] }); expect(seen[0]!.url).toContain("gemini-2.5-flash:generateContent"); expect(JSON.parse(seen[0]!.init.body as string).contents[0].parts[0].text).toBe('{"hello":1}');
    expect((await aiStatus(db, { ...s, aiProvider: "gateway", aiGatewayUrl: "" })).why).toMatch(/gateway address/);
  });
  it("the breakdown request carries only the objective and its children's titles", () => {
    const o = (p: Partial<Objective>): Objective => ({ id: "o1", title: "Learn French", description: "SECRET-DESC", why: "Live abroad", areaId: null, level: "annual", parentId: null, start: "2026-01-01", target: "2026-12-31", priority: 2, status: "active", completionCriteria: "SECRET-CRITERIA", evidenceRequired: false, createdAt: 0, updatedAt: 0, ...p });
    const s = JSON.stringify(buildBreakdownRequest(o({}), [o({ id: "c", title: "Pass DELF" })])); expect(s).toContain("Learn French"); expect(s).toContain("Pass DELF"); expect(s).not.toMatch(/SECRET/); expect(s).toContain("Quarterly objective");
  });
});

const obj = (p: Partial<Objective>): Objective => ({ id: "p", title: "Annual goal", description: "", why: "", areaId: null, level: "annual", parentId: null, start: "2026-01-01", target: "2026-12-31", priority: 2, status: "active", completionCriteria: "", evidenceRequired: false, createdAt: 0, updatedAt: 0, ...p });
const guard = (objectives: Objective[]): GuardContext => ({ ctx: { rules: defaultRules(), today: "2026-11-23", now: 420, busy: () => [] }, tasks: [], objectives, occurrences: [] });
describe("AI sub-objective suggestions stay inside their parent", () => {
  const op = (p: Record<string, unknown> = {}) => ({ op: "propose_objective", parentId: "p", title: "Pass the exam", why: "needed", start: "2026-12-01", target: "2026-12-30", ...p });
  it("accepts a valid one, forcing the correct child level (the model cannot pick it)", () => {
    const v = validateAi({ operations: [op({ level: "four-year" })] }, guard([obj({})])); expect(v.rejected).toEqual([]); expect(v.accepted[0]).toMatchObject({ op: "propose_objective", level: "quarterly", parentId: "p" });
  });
  it("rejects unknown/cancelled parents, dates outside the parent window, bad dates, duplicates, and levels with nothing below", () => {
    const g = guard([obj({}), obj({ id: "x", status: "cancelled" }), obj({ id: "w", level: "weekly" }), obj({ id: "k", parentId: "p", title: "Pass the exam", level: "quarterly" })]);
    const r = (o: Record<string, unknown>) => validateAi({ operations: [o] }, g).rejected[0]?.reasons.join(" ") ?? "ACCEPTED";
    expect(r(op({ parentId: "ghost" }))).toMatch(/parentId does not exist/); expect(r(op({ parentId: "x" }))).toMatch(/no longer active/); expect(r(op({ parentId: "w" }))).toMatch(/no lower level/);
    expect(r(op({ start: "2025-12-01" }))).toMatch(/inside the parent's window/); expect(r(op({ target: "2027-02-01" }))).toMatch(/inside the parent's window/); expect(r(op({ start: "2026-12-30", target: "2026-12-01" }))).toMatch(/inside the parent's window/);
    expect(r(op({ start: "nope" }))).toMatch(/not valid dates/); expect(r(op({ title: "pass the EXAM" }))).toMatch(/already exists/); expect(r(op({ title: "" }))).toMatch(/title is required/);
  });
});

describe("calendar: unschedule, undo, conflicts", () => {
  const sess: Session = { id: "s1", occId: "t@1", date: "2026-11-24", startMin: 600, endMin: 660, state: "approved", reason: "", createdAt: 1 };
  const occ: Occurrence = { id: "t@1", taskId: "t", date: "2026-11-24", status: "planned", moves: 0, createdAt: 0 };
  it("unscheduling cancels the session, records a change, and undo restores the exact slot", () => {
    const u = unscheduleSession(sess, "t", "by you", 5); expect(u.sessions[0]!.state).toBe("cancelled"); expect(u.changes[0]).toMatchObject({ kind: "cancel", auto: false, before: { date: "2026-11-24", startMin: 600 }, after: null });
    const r = undoChange(u.changes[0]!, [u.sessions[0]!], occ, [u.changes[0]!], 9); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.mutation.sessions.map((s) => s.state)).toEqual(["cancelled", "approved"]); expect(r.mutation.sessions[1]).toMatchObject({ date: "2026-11-24", startMin: 600, endMin: 660 });
  });
  it("finds sessions that overlap a commitment, ignores resolved work, cancelled sessions and other days", () => {
    const cm = [{ date: "2026-11-24", startMin: 630, endMin: 700, title: "Dentist" }]; const live = new Set(["t@1"]);
    expect(sessionConflicts([sess], cm, live)).toEqual([{ session: sess, with: "Dentist" }]);
    expect(sessionConflicts([sess], cm, new Set())).toEqual([]); expect(sessionConflicts([{ ...sess, state: "cancelled" }], cm, live)).toEqual([]);
    expect(sessionConflicts([sess], [{ ...cm[0]!, date: "2026-11-25" }], live)).toEqual([]); expect(sessionConflicts([sess], [{ ...cm[0]!, startMin: 660 }], live)).toEqual([]);
  });
});

describe("backup with attachments", () => {
  const file = (name: string, b: number[]) => new File([new Uint8Array(b)], name, { type: "application/pdf" });
  it("includes attachments only when asked; the checksum covers them; tampering is caught; restore brings the bytes back", async () => {
    const a = await open(); const m = await saveAttachment(a, file("proof.pdf", [9, 8, 7, 6]));
    const without = await createBackup(a); expect(without.attachments).toBeUndefined(); await validateBackup(JSON.parse(JSON.stringify(without)));
    const withF = JSON.parse(JSON.stringify(await createBackup(a, { attachments: true }))); expect(withF.attachments).toHaveLength(1); await validateBackup(withF);
    const bad = structuredClone(withF); bad.attachments[0].b64 = "AAAA"; await expect(validateBackup(bad)).rejects.toThrow(/damaged/);
    const b = await open(); await restoreBackup(b, withF); const got = await loadAttachment(b, m.id); expect(new Uint8Array(await got!.blob.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7, 6])); expect(got!.name).toBe("proof.pdf");
  });
  it("restoring a backup WITHOUT attachments keeps the attachments already on the device", async () => {
    const a = await open(); const plain = JSON.parse(JSON.stringify(await createBackup(a)));
    const b = await open(); const m = await saveAttachment(b, file("keep.pdf", [1, 2])); await restoreBackup(b, plain); expect(await loadAttachment(b, m.id)).toBeTruthy();
  });
});
