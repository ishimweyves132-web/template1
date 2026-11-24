// Evidence attachments: files live in their own IndexedDB store, on this device. Nothing is uploaded anywhere.
import { uid } from "./model";
import type { Db } from "./db";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export interface StoredFile { id: string; name: string; mime: string; size: number; blob: Blob; createdAt: number }
export interface FileMeta { id: string; name: string; mime: string; size: number }
// Files are never run or rendered as pages. Executable/script/markup types are refused outright; only common raster images are previewed.
const BLOCKED = /\.(exe|bat|cmd|com|scr|msi|jar|apk|sh|ps1|vbs|js|mjs|html?|xhtml|dll)$/i;
export const PREVIEWABLE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const clean = (name: string) => name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || "file";

export function checkFile(f: { name: string; size: number }): string | null {
  if (f.size === 0) return "That file is empty.";
  if (f.size > MAX_FILE_BYTES) return `That file is ${fmtSize(f.size)}. The limit is ${fmtSize(MAX_FILE_BYTES)} per file.`;
  if (BLOCKED.test(f.name)) return "Programs, scripts and web pages cannot be attached. Attach a document, image or PDF instead.";
  return null;
}
/** Stores the file and returns its metadata. Throws a readable Error (too big, blocked type, or device storage full). */
export async function saveAttachment(db: Db, file: File): Promise<FileMeta> {
  const why = checkFile(file); if (why) throw new Error(why);
  const rec: StoredFile = { id: uid(), name: clean(file.name), mime: file.type || "application/octet-stream", size: file.size, blob: file, createdAt: Date.now() };
  try { await db.put("files", rec); }
  catch (e) { throw new Error((e as DOMException)?.name === "QuotaExceededError" ? "This device has no room for that file. Remove some attachments or free storage." : "The file could not be saved on this device."); }
  return { id: rec.id, name: rec.name, mime: rec.mime, size: rec.size };
}
export const loadAttachment = (db: Db, id: string) => db.get<StoredFile>("files", id);
export const removeAttachment = (db: Db, id: string) => db.write({ del: [["files", id]] });
export async function storageUsed(db: Db): Promise<{ count: number; bytes: number }> { const all = await db.getAll<StoredFile>("files"); return { count: all.length, bytes: all.reduce((a, f) => a + f.size, 0) }; }
