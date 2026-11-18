// Thin promise wrapper over IndexedDB. Everything the user records lives here, on the device.
import { defaultSettings, type Settings } from "./model";

export const STORES = ["sessions", "marks", "vocab", "goals", "challenges", "snapshots"] as const;
export type StoreName = (typeof STORES)[number];
const DB_VERSION = 2;

const wrap = <T,>(r: IDBRequest<T>) =>
  new Promise<T>((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
const done = (tx: IDBTransaction) =>
  new Promise<void>((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error("Transaction aborted"));
  });

export class Db {
  constructor(readonly idb: IDBDatabase) {}

  static open(name = "french-mastery-tracker"): Promise<Db> {
    return new Promise((res, rej) => {
      const req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const d = req.result;
        if (ev.oldVersion >= 1) { d.createObjectStore("phrases", { autoIncrement: true }); return; } // v1 -> v2: add the phrases store only
        d.createObjectStore("phrases", { autoIncrement: true });
        d.createObjectStore("sessions", { keyPath: "id" }).createIndex("date", "date");
        d.createObjectStore("marks", { keyPath: "key" });
        d.createObjectStore("vocab", { keyPath: "id" });
        d.createObjectStore("goals", { keyPath: "id" });
        d.createObjectStore("challenges", { keyPath: "id" });
        d.createObjectStore("snapshots", { keyPath: "id" });
        d.createObjectStore("kv", { keyPath: "key" });
        d.createObjectStore("dict", { autoIncrement: true }).createIndex("k", "k");
        d.createObjectStore("partial", { keyPath: "key" });
      };
      req.onsuccess = () => res(new Db(req.result));
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error("Database upgrade blocked by another tab"));
    });
  }
  close() { this.idb.close(); }

  async getAll<T>(store: string): Promise<T[]> {
    return wrap(this.idb.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
  }
  async get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
    return wrap(this.idb.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>);
  }
  async put(store: string, value: unknown) {
    const tx = this.idb.transaction(store, "readwrite");
    tx.objectStore(store).put(value);
    await done(tx);
  }
  async putMany(store: string, values: unknown[]) {
    const tx = this.idb.transaction(store, "readwrite");
    const os = tx.objectStore(store);
    values.forEach((v) => os.put(v));
    await done(tx);
  }
  async delete(store: string, key: IDBValidKey) {
    const tx = this.idb.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    await done(tx);
  }
  async clear(store: string) {
    const tx = this.idb.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    await done(tx);
  }
  async count(store: string): Promise<number> {
    return wrap(this.idb.transaction(store).objectStore(store).count());
  }
  /** Replace the contents of several stores in ONE transaction: all-or-nothing. */
  async replaceStores(data: Record<string, unknown[]>) {
    const names = Object.keys(data);
    const tx = this.idb.transaction(names, "readwrite");
    for (const n of names) {
      const os = tx.objectStore(n);
      os.clear();
      data[n]!.forEach((v) => os.put(v));
    }
    await done(tx);
  }

  async loadSettings(): Promise<Settings> {
    const row = await this.get<{ key: string; value: Partial<Settings> }>("kv", "settings");
    return { ...defaultSettings(), ...(row?.value ?? {}) };
  }
  saveSettings(s: Settings) { return this.put("kv", { key: "settings", value: s }); }
}
