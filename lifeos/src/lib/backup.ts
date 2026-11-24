import { DATA_STORES, type Db } from "./db";
import { uid, type Settings } from "./model";
import type { StoredFile } from "./attachments";

export const APP_ID = "lifeos";
export interface BackupAttachment { id: string; name: string; mime: string; size: number; createdAt: number; b64: string }
export interface BackupFile { app: typeof APP_ID; version: 1; exportedAt: string; checksum: string; data: Record<string, unknown[]> & { settings?: never }; settings: Settings; attachments?: BackupAttachment[] }
async function sha(text: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
const digestOf = (f: Pick<BackupFile, "data" | "settings" | "attachments">) => sha(JSON.stringify({ data: f.data, settings: f.settings, ...(f.attachments ? { attachments: f.attachments } : {}) }));
export async function blobToB64(blob: Blob): Promise<string> { const u = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); }
export const b64ToBlob = (b64: string, type: string): Blob => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };

/** The AI key is never included (it lives in its own vault entry). Attachments are optional because they make the file much larger. */
export async function createBackup(db: Db, opts: { attachments?: boolean } = {}): Promise<BackupFile> {
  const data: Record<string, unknown[]> = {}; for (const s of DATA_STORES) data[s] = await db.getAll(s);
  const settings = await db.loadSettings();
  const attachments = opts.attachments ? await Promise.all((await db.getAll<StoredFile>("files")).map(async (f) => ({ id: f.id, name: f.name, mime: f.mime, size: f.size, createdAt: f.createdAt, b64: await blobToB64(f.blob) }))) : undefined;
  const base = { data: data as BackupFile["data"], settings, ...(attachments ? { attachments } : {}) };
  return { app: APP_ID, version: 1, exportedAt: new Date().toISOString(), checksum: await digestOf(base), ...base };
}
export async function validateBackup(raw: unknown): Promise<BackupFile> {
  const f = raw as BackupFile;
  if (!f || typeof f !== "object" || f.app !== APP_ID) throw new Error("This is not a LifeOS backup file.");
  if (f.version !== 1) throw new Error(`Unsupported backup version ${String((f as { version?: unknown }).version)}.`);
  if (!f.data || typeof f.data !== "object" || !f.settings) throw new Error("Backup has no data.");
  if ((await digestOf(f)) !== f.checksum) throw new Error("Backup is damaged: the checksum does not match. Nothing was changed.");
  const OPTIONAL = new Set(["chat", "aiRuns"]);   // added in a later version: older backups simply have none
  for (const s of DATA_STORES) { if (f.data[s] === undefined && OPTIONAL.has(s)) f.data[s] = []; if (!Array.isArray(f.data[s])) throw new Error(`Backup is missing "${s}".`); }
  for (const s of DATA_STORES) for (const r of f.data[s]!) if (!r || typeof (r as { id?: unknown }).id !== "string") throw new Error(`Backup contains an invalid record in "${s}". Nothing was changed.`);
  if (f.attachments !== undefined) { if (!Array.isArray(f.attachments) || f.attachments.some((a) => !a || typeof a.id !== "string" || typeof a.b64 !== "string" || typeof a.name !== "string")) throw new Error("Backup contains an invalid attachment. Nothing was changed."); }
  return f;
}
export interface Snapshot { id: string; at: number; reason: string; backup: BackupFile }
export async function takeSnapshot(db: Db, reason: string): Promise<void> {
  await db.put("snapshots", { id: uid(), at: Date.now(), reason, backup: await createBackup(db) } satisfies Snapshot);
  const all = (await db.getAll<Snapshot>("snapshots")).sort((a, b) => b.at - a.at);
  await db.write({ del: all.slice(5).map((s) => ["snapshots", s.id] as [string, string]) });
}
/** Replace everything with the backup in one transaction, after a safety snapshot. Attachments are replaced only if the backup contains them. */
export async function restoreBackup(db: Db, file: BackupFile, reason = "before restore") {
  const f = await validateBackup(file); await takeSnapshot(db, reason);
  await db.replaceStores(f.data as Record<string, unknown[]>); await db.saveSettings(f.settings);
  if (f.attachments) await db.replaceStores({ files: f.attachments.map((a): StoredFile => ({ id: a.id, name: a.name, mime: a.mime, size: a.size, createdAt: a.createdAt, blob: b64ToBlob(a.b64, a.mime) })) });
}
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function downloadJson(name: string, obj: unknown, mime = "application/json") {
  const url = URL.createObjectURL(new Blob([typeof obj === "string" ? obj : JSON.stringify(obj)], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
