// The API key vault. The key is encrypted with a NON-EXTRACTABLE AES-GCM key kept in IndexedDB, so the stored value is useless
// outside this browser profile. It is never part of settings, backups or safety copies, and only ever sent to the AI provider.
import type { Db } from "./db";

interface Vault { iv: number[]; ct: number[]; last4: string; savedAt: number }
async function deviceKey(db: Db, create: boolean): Promise<CryptoKey | null> {
  const ex = await db.getKv<CryptoKey>("deviceKey"); if (ex) return ex; if (!create) return null;
  const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); await db.setKv("deviceKey", k); return k;
}
export async function saveKey(db: Db, plain: string): Promise<void> {
  const key = plain.trim(); if (key.length < 20 || /\s/.test(key)) throw new Error("That does not look like an API key (it should be one long string with no spaces).");
  const k = (await deviceKey(db, true))!; const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(key)));
  await db.setKv("aiKey", { iv: [...iv], ct: [...ct], last4: key.slice(-4), savedAt: Date.now() } satisfies Vault);
}
export async function loadKey(db: Db): Promise<string | null> {
  const v = await db.getKv<Vault>("aiKey"); const k = await deviceKey(db, false); if (!v || !k) return null;
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(v.iv) }, k, new Uint8Array(v.ct))); } catch { return null; }
}
export async function keyInfo(db: Db): Promise<{ last4: string; savedAt: number } | null> { const v = await db.getKv<Vault>("aiKey"); return v ? { last4: v.last4, savedAt: v.savedAt } : null; }
export async function clearKey(db: Db): Promise<void> { await db.delKv("aiKey"); }
