import type { Db } from "./db";
import { isDateStr } from "./dates";
import { ACTIVITIES, uid, type Settings } from "./model";

export const APP_ID = "french-mastery-tracker";
const DATA_STORES = ["sessions", "marks", "vocab", "goals", "challenges"] as const;
type Data = Record<(typeof DATA_STORES)[number], any[]> & { settings: Settings };

export interface BackupFile { app: typeof APP_ID; version: 1; exportedAt: string; checksum: string; data: Data }

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function collect(db: Db): Promise<Data> {
  const [sessions, marks, vocab, goals, challenges, settings] = await Promise.all([
    db.getAll("sessions"), db.getAll("marks"), db.getAll("vocab"), db.getAll("goals"), db.getAll("challenges"), db.loadSettings(),
  ]);
  // The downloaded dictionary and any in-progress download are re-downloadable, so they are not part of backups.
  return { sessions, marks, vocab, goals, challenges, settings: { ...settings, activeTimer: null } };
}

export async function createBackup(db: Db): Promise<BackupFile> {
  const data = await collect(db);
  return { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), checksum: await sha256Hex(JSON.stringify(data)), data };
}

/** Throws a readable Error if the file is not a valid, intact backup. */
export async function validateBackup(raw: unknown): Promise<BackupFile> {
  const f = raw as BackupFile;
  if (!f || typeof f !== "object" || f.app !== APP_ID) throw new Error("This is not a French Mastery Tracker backup file.");
  if (f.version !== 1) throw new Error(`Unsupported backup version ${String((f as any).version)}.`);
  if (!f.data || typeof f.data !== "object") throw new Error("Backup has no data.");
  if ((await sha256Hex(JSON.stringify(f.data))) !== f.checksum) throw new Error("Backup is damaged: the checksum does not match. Nothing was changed.");
  for (const k of DATA_STORES) if (!Array.isArray(f.data[k])) throw new Error(`Backup is missing "${k}".`);
  for (const s of f.data.sessions) {
    if (!s || typeof s.id !== "string" || !isDateStr(s.date) || !(ACTIVITIES as readonly string[]).includes(s.activity) ||
        !Number.isFinite(s.minutes) || s.minutes < 0) throw new Error("Backup contains an invalid session record. Nothing was changed.");
  }
  for (const v of f.data.vocab) if (!v || typeof v.id !== "string" || typeof v.fr !== "string") throw new Error("Backup contains an invalid vocabulary entry.");
  if (!Array.isArray(f.data.settings?.targetHistory) || !f.data.settings.targetHistory.length) throw new Error("Backup has invalid settings.");
  return f;
}

export interface Snapshot { id: string; at: number; reason: string; backup: BackupFile }

/** Safety copy kept inside the app. Keeps the 5 most recent. */
export async function takeSnapshot(db: Db, reason: string): Promise<Snapshot> {
  const snap: Snapshot = { id: uid(), at: Date.now(), reason, backup: await createBackup(db) };
  await db.put("snapshots", snap);
  const all = (await db.getAll<Snapshot>("snapshots")).sort((a, b) => b.at - a.at);
  for (const old of all.slice(5)) await db.delete("snapshots", old.id);
  return snap;
}

export async function restoreBackup(db: Db, file: BackupFile, mode: "replace" | "merge", reason = "before restore") {
  const f = await validateBackup(file);
  await takeSnapshot(db, reason);
  if (mode === "replace") {
    // One transaction across all stores: either everything is restored or nothing changes.
    await db.replaceStores({ sessions: f.data.sessions, marks: f.data.marks, vocab: f.data.vocab, goals: f.data.goals, challenges: f.data.challenges });
    await db.saveSettings({ ...(await db.loadSettings()), ...f.data.settings, activeTimer: null });
    return;
  }
  // Merge: add records whose id is not already present; existing records are never overwritten.
  for (const store of ["sessions", "vocab", "goals", "challenges"] as const) {
    const have = new Set((await db.getAll<{ id: string }>(store)).map((r) => r.id));
    await db.putMany(store, f.data[store].filter((r) => !have.has(r.id)));
  }
  const haveMarks = new Set((await db.getAll<{ key: string }>("marks")).map((r) => r.key));
  await db.putMany("marks", f.data.marks.filter((r) => !haveMarks.has(r.key)));
}

export function downloadJson(name: string, obj: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
