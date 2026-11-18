// Optional offline dictionary. A "pack" is a gzip'd JSON-Lines file described by a small manifest.
// Nothing is bundled with the app; the user downloads a pack once and then searches fully offline.
import type { Db } from "./db";
import type { DictMeta } from "./model";

export interface Manifest {
  version: string; file: string; size: number; sha256: string; count: number;
  license: string; source: string; description?: string; languages?: string[];
}
export interface DictEntry {
  k: string;          // normalised headword, used for lookup
  w: string;          // headword as written
  p?: string;         // part of speech
  g?: string;         // gender: m / f / mf
  ipa?: string;
  d: { t: string; l: "fr" | "en" }[];            // definitions / translations
  x?: { f: string; e?: string }[];               // example sentences
}

/** Multi-word headwords (idioms, expressions, compounds) are also kept in a separate store so the Phrasebook can search them. */
export const isPhrase = (e: { w: string; p?: string }) => /\s/.test(e.w.trim()) && e.p !== "name";

export function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae")
    .replace(/[’‘]/g, "'").trim().replace(/\s+/g, " ");
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha256(blob: Blob): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
}

export type DictProgress = { phase: "download" | "verify" | "install"; done: number; total: number };

export class DictError extends Error {}

export async function fetchManifest(url: string): Promise<{ manifest: Manifest; fileUrl: string; actualSize: number }> {
  let res: Response;
  try { res = await fetch(url, { cache: "no-store" }); } catch { throw new DictError("Cannot reach the dictionary server. Check your internet connection."); }
  if (!res.ok) throw new DictError(`No dictionary pack is published at this address (HTTP ${res.status}).`);
  let manifest: Manifest;
  try { manifest = await res.json(); } catch { throw new DictError("The dictionary address did not return a valid manifest."); }
  if (!manifest.file || !manifest.sha256 || !Number.isFinite(manifest.size)) throw new DictError("The dictionary manifest is incomplete.");
  const fileUrl = new URL(manifest.file, new URL(url, typeof location !== "undefined" ? location.href : "http://localhost/")).href;
  // Ask the server for the real size so we never show a number we invented.
  let actual = NaN;
  try {
    const head = await fetch(fileUrl, { method: "HEAD", cache: "no-store" });
    actual = Number(head.headers.get("content-length"));
  } catch { /* handled below */ }
  if (!Number.isFinite(actual) || actual <= 0) throw new DictError("The server did not report the file size, so the download was not started.");
  if (actual !== manifest.size) throw new DictError(`Server file size (${actual} bytes) differs from the manifest (${manifest.size} bytes). Download refused.`);
  return { manifest, fileUrl, actualSize: actual };
}

interface Partial { key: "pack"; sha256: string; size: number; received: number; chunks: Blob[] }

/**
 * Download with resume. Partial data is kept in IndexedDB, nothing is installed until the SHA-256 matches,
 * and the existing dictionary (if any) is untouched until the new one has been fully verified.
 */
export async function downloadPack(db: Db, url: string, onProgress: (p: DictProgress) => void, signal?: AbortSignal): Promise<DictMeta> {
  const { manifest, fileUrl } = await fetchManifest(url);
  let part = await db.get<Partial>("partial", "pack");
  if (!part || part.sha256 !== manifest.sha256 || part.size !== manifest.size) part = { key: "pack", sha256: manifest.sha256, size: manifest.size, received: 0, chunks: [] };

  let sinceSave = 0;
  while (part.received < manifest.size) {
    let res: Response;
    try {
      res = await fetch(fileUrl, { headers: part.received ? { Range: `bytes=${part.received}-` } : {}, signal: signal ?? null, cache: "no-store" });
    } catch (e) {
      if (signal?.aborted) throw new DictError("Download paused. It will resume where it stopped.");
      await db.put("partial", part);
      throw new DictError("Connection lost. The download will resume where it stopped.");
    }
    const enc = res.headers.get("content-encoding");
    if (enc && enc !== "identity") throw new DictError("This server compresses the file in transit, which breaks verification. Host the pack as a plain .pack file (no gzip/brotli content-encoding).");
    if (part.received && res.status !== 206) { part = { ...part, received: 0, chunks: [] }; await db.put("partial", part); continue; }
    if (!res.ok || !res.body) throw new DictError(`Download failed (HTTP ${res.status}).`);
    const reader = res.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        part.chunks.push(new Blob([value as BlobPart]));
        part.received += value.byteLength; sinceSave += value.byteLength;
        onProgress({ phase: "download", done: part.received, total: manifest.size });
        if (sinceSave > 2_000_000) { await db.put("partial", part); sinceSave = 0; }
      }
    } catch {
      await db.put("partial", part);
      throw new DictError(signal?.aborted ? "Download paused. It will resume where it stopped." : "Connection lost. The download will resume where it stopped.");
    }
  }
  await db.put("partial", part);

  onProgress({ phase: "verify", done: 0, total: 1 });
  const blob = new Blob(part.chunks);
  if (blob.size !== manifest.size || (await sha256(blob)) !== manifest.sha256) {
    await db.delete("partial", "pack");
    throw new DictError("The downloaded file failed verification (checksum mismatch) and was discarded. Please try again.");
  }
  const meta = await installPack(db, blob, manifest, url, onProgress);
  await db.delete("partial", "pack");
  return meta;
}

export async function installPack(db: Db, blob: Blob, manifest: Manifest, url: string, onProgress: (p: DictProgress) => void = () => {}): Promise<DictMeta> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const gz = head[0] === 0x1f && head[1] === 0x8b;
  const text = (gz ? blob.stream().pipeThrough(new DecompressionStream("gzip")) : blob.stream()).pipeThrough(new TextDecoderStream());
  const reader = text.getReader();
  const settings = await db.loadSettings();
  // Mark "not installed" while writing, so a crash mid-install can never leave a half dictionary in use.
  await db.saveSettings({ ...settings, dict: null });
  await db.clear("dict"); await db.clear("phrases");
  let buf = "", n = 0, batch: DictEntry[] = [], phr: DictEntry[] = [];
  const flush = async () => { if (batch.length) { await db.putMany("dict", batch); if (phr.length) await db.putMany("phrases", phr); n += batch.length; batch = []; phr = []; onProgress({ phase: "install", done: n, total: manifest.count }); } };
  const take = (line: string) => {
    if (!line.trim()) return;
    const e = JSON.parse(line) as Omit<DictEntry, "k">;
    const full = { ...e, k: normalize(e.w) }; batch.push(full); if (isPhrase(full)) phr.push(full);
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) {
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); if (batch.length >= 2000) await flush(); }
      }
      if (done) break;
    }
    take(buf); await flush();
  } catch (e) {
    await db.clear("dict"); await db.clear("phrases");
    throw new DictError(`The dictionary file could not be read: ${(e as Error).message}`);
  }
  if (n !== manifest.count) { await db.clear("dict"); await db.clear("phrases"); throw new DictError(`Entry count mismatch (${n} read, ${manifest.count} expected). Dictionary not installed.`); }
  const meta: DictMeta = { installed: true, version: manifest.version, count: n, size: manifest.size, license: manifest.license, source: manifest.source, installedAt: Date.now(), url };
  await db.saveSettings({ ...(await db.loadSettings()), dict: meta });
  return meta;
}

export async function removeDictionary(db: Db) {
  await db.clear("dict"); await db.clear("phrases"); await db.delete("partial", "pack");
  await db.saveSettings({ ...(await db.loadSettings()), dict: null });
}

/** Exact headword match first, then words that start with the query. Accent- and case-insensitive. */
export async function searchDict(db: Db, query: string, limit = 25): Promise<DictEntry[]> {
  const q = normalize(query);
  if (!q) return [];
  const idx = db.idb.transaction("dict").objectStore("dict").index("k");
  const get = (range: IDBKeyRange, max: number) => new Promise<DictEntry[]>((res, rej) => {
    const out: DictEntry[] = [];
    const req = idx.openCursor(range);
    req.onsuccess = () => { const c = req.result; if (c && out.length < max) { out.push(c.value); c.continue(); } else res(out); };
    req.onerror = () => rej(req.error);
  });
  const exact = await get(IDBKeyRange.only(q), limit);
  if (exact.length >= limit) return exact;
  const prefix = await get(IDBKeyRange.bound(q, q + "￿"), limit + exact.length);
  return [...exact, ...prefix.filter((e) => e.k !== q)].slice(0, limit);
}

/**
 * Installs a dictionary pack that ships INSIDE the app (e.g. the Android APK), with no network.
 * Uses plain GETs (no HEAD/Range, which app asset servers may not support) and the same size + SHA-256 checks as a download.
 * Returns null when the app has no bundled pack, or the same version is already installed.
 */
export async function installBundled(db: Db, manifestUrl: string, onProgress: (p: DictProgress) => void = () => {}): Promise<DictMeta | null> {
  let res: Response;
  try { res = await fetch(manifestUrl, { cache: "no-store" }); } catch { return null; }
  if (!res.ok) return null;
  let manifest: Manifest;
  try { manifest = await res.json(); } catch { return null; }
  if (!manifest.file || !manifest.sha256 || !Number.isFinite(manifest.size)) return null;
  const cur = (await db.loadSettings()).dict;
  if (cur?.installed && cur.version === manifest.version && cur.count === manifest.count) return null;
  const fileUrl = new URL(manifest.file, new URL(manifestUrl, typeof location !== "undefined" ? location.href : "http://localhost/")).href;
  const fr = await fetch(fileUrl, { cache: "no-store" });
  if (!fr.ok) throw new DictError(`Bundled dictionary file is missing (HTTP ${fr.status}).`);
  const blob = await fr.blob();
  onProgress({ phase: "verify", done: 0, total: 1 });
  if (blob.size !== manifest.size || (await sha256(blob)) !== manifest.sha256) throw new DictError("The bundled dictionary failed verification (checksum mismatch).");
  return installPack(db, blob, manifest, manifestUrl, onProgress);
}

/** Expressions from the installed dictionary: matches in the French text first (prefix, then contains), then in English meanings. */
export async function searchPhraseDict(db: Db, query: string, limit = 30): Promise<DictEntry[]> {
  const q = normalize(query), ql = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const all = await new Promise<DictEntry[]>((res, rej) => {
    const out: DictEntry[] = []; const req = db.idb.transaction("phrases").objectStore("phrases").openCursor();
    req.onsuccess = () => {
      const c = req.result; if (!c) return res(out);
      const e = c.value as DictEntry;
      const rank = e.k.startsWith(q) ? 0 : e.k.includes(q) ? 1 : ql.length >= 3 && e.d.some((d) => d.t.toLowerCase().includes(ql)) ? 2 : -1;
      if (rank >= 0) out.push(Object.assign(e, { rank }) as DictEntry);
      c.continue();
    };
    req.onerror = () => rej(req.error);
  });
  return all.sort((a, b) => ((a as any).rank - (b as any).rank) || a.w.length - b.w.length).slice(0, limit);
}

/** Dictionaries installed before the phrases store existed: fill it from the dictionary once. Returns how many phrases were found. */
export async function rebuildPhrases(db: Db): Promise<number> {
  if ((await db.count("phrases")) > 0 || (await db.count("dict")) === 0) return 0;
  let n = 0, batch: DictEntry[] = [];
  await new Promise<void>((res, rej) => {
    const req = db.idb.transaction("dict").objectStore("dict").openCursor();
    req.onsuccess = () => { const c = req.result; if (!c) return res(); if (isPhrase(c.value)) batch.push(c.value as DictEntry); c.continue(); };
    req.onerror = () => rej(req.error);
  });
  for (let i = 0; i < batch.length; i += 2000) { await db.putMany("phrases", batch.slice(i, i + 2000)); n += Math.min(2000, batch.length - i); }
  return n;
}
