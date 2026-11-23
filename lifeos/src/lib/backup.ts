import { DATA_STORES, type Db } from "./db";
import { uid, type Settings } from "./model";

export const APP_ID = "lifeos";
export interface BackupFile { app: typeof APP_ID; version: 1; exportedAt: string; checksum: string; data: Record<string, unknown[]> & { settings?: never }; settings: Settings }
async function sha(text: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export async function createBackup(db: Db): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {}; for (const s of DATA_STORES) data[s] = await db.getAll(s);
  const settings = await db.loadSettings();
  return { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), checksum: await sha(JSON.stringify({ data, settings })), data: data as BackupFile["data"], settings };
}
export async function validateBackup(raw: unknown): Promise<BackupFile> {
  const f = raw as BackupFile;
  if (!f || typeof f !== "object" || f.app !== APP_ID) throw new Error("This is not a LifeOS backup file.");
  if (f.version !== 1) throw new Error(`Unsupported backup version ${String((f as { version?: unknown }).version)}.`);
  if (!f.data || typeof f.data !== "object" || !f.settings) throw new Error("Backup has no data.");
  if ((await sha(JSON.stringify({ data: f.data, settings: f.settings }))) !== f.checksum) throw new Error("Backup is damaged: the checksum does not match. Nothing was changed.");
  for (const s of DATA_STORES) if (!Array.isArray(f.data[s])) throw new Error(`Backup is missing "${s}".`);
  for (const s of DATA_STORES) for (const r of f.data[s]!) if (!r || typeof (r as { id?: unknown }).id !== "string") throw new Error(`Backup contains an invalid record in "${s}". Nothing was changed.`);
  return f;
}
export interface Snapshot { id: string; at: number; reason: string; backup: BackupFile }
export async function takeSnapshot(db: Db, reason: string): Promise<void> {
  await db.put("snapshots", { id: uid(), at: Date.now(), reason, backup: await createBackup(db) } satisfies Snapshot);
  const all = (await db.getAll<Snapshot>("snapshots")).sort((a, b) => b.at - a.at);
  await db.write({ del: all.slice(5).map((s) => ["snapshots", s.id] as [string, string]) });
}
/** Replace everything with the backup in one transaction, after taking a safety snapshot of the current data. */
export async function restoreBackup(db: Db, file: BackupFile, reason = "before restore") {
  const f = await validateBackup(file); await takeSnapshot(db, reason);
  await db.replaceStores(f.data as Record<string, unknown[]>); await db.saveSettings(f.settings);
}
export function downloadJson(name: string, obj: unknown, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([typeof obj === "string" ? obj : JSON.stringify(obj)], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
