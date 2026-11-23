// IndexedDB wrapper. The local database is the source of truth; every write is a single transaction.
import { defaultSettings, type Settings } from "./model";

export const DATA_STORES = ["vision", "areas", "objectives", "krs", "krPoints", "tasks", "occurrences", "sessions", "executions", "habits", "habitLogs", "evidence", "commitments", "reviews", "changes", "aiAudit"] as const;
export type StoreName = (typeof DATA_STORES)[number];
const ALL = [...DATA_STORES, "snapshots", "kv"] as const;
const DB_VERSION = 1;
const wrap = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error("Transaction aborted")); });

export class Db {
  constructor(readonly idb: IDBDatabase) {}
  static open(name = "lifeos"): Promise<Db> {
    return new Promise((res, rej) => {
      const req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = () => { for (const s of ALL) req.result.createObjectStore(s, { keyPath: s === "kv" ? "key" : "id" }); };
      req.onsuccess = () => res(new Db(req.result)); req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error("Database upgrade blocked by another tab"));
    });
  }
  close() { this.idb.close(); }
  getAll<T>(store: string): Promise<T[]> { return wrap(this.idb.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>); }
  /** Several writes across stores in ONE transaction: all-or-nothing. */
  async write(ops: { put?: [string, unknown][]; del?: [string, string][] }) {
    const names = [...new Set([...(ops.put ?? []).map((p) => p[0]), ...(ops.del ?? []).map((d) => d[0])])]; if (!names.length) return;
    const tx = this.idb.transaction(names, "readwrite"); const finished = done(tx);
    try {
      for (const [s, v] of ops.put ?? []) tx.objectStore(s).put(v);
      for (const [s, k] of ops.del ?? []) tx.objectStore(s).delete(k);
    } catch (e) { tx.abort(); await finished.catch(() => {}); throw e; }   // a bad record must cancel EVERYTHING in this write, not just itself
    await finished;
  }
  put(store: string, v: unknown) { return this.write({ put: [[store, v]] }); }
  async count(store: string) { return wrap(this.idb.transaction(store).objectStore(store).count()); }
  async replaceStores(data: Record<string, unknown[]>) {
    const names = Object.keys(data); const tx = this.idb.transaction(names, "readwrite"); const finished = done(tx);
    try { for (const n of names) { const os = tx.objectStore(n); os.clear(); data[n]!.forEach((v) => os.put(v)); } }
    catch (e) { tx.abort(); await finished.catch(() => {}); throw e; }
    await finished;
  }
  async loadSettings(): Promise<Settings> { const row = (await wrap(this.idb.transaction("kv").objectStore("kv").get("settings") as IDBRequest<{ value: Partial<Settings> } | undefined>)); const d = defaultSettings(); return { ...d, ...(row?.value ?? {}), rules: { ...d.rules, ...(row?.value?.rules ?? {}) } }; }
  saveSettings(s: Settings) { return this.put("kv", { key: "settings", value: s }); }
  async getKv<T>(key: string): Promise<T | undefined> { return (await wrap(this.idb.transaction("kv").objectStore("kv").get(key) as IDBRequest<{ value: T } | undefined>))?.value; }
  setKv(key: string, value: unknown) { return this.put("kv", { key, value }); }
  async delKv(key: string) { return this.write({ del: [["kv", key]] }); }
}
