// Android (Capacitor) integration. On the web and in the desktop app every function here is a harmless fallback.
// NOTE: the native paths cannot be run in the build sandbox (no Android device/emulator); see README for what is verified.
import { Capacitor } from "@capacitor/core";
import type { Reminder } from "./reminders";

export const isNative = () => Capacitor.isNativePlatform();
const CHANNEL = "lifeos-sessions";

const toBase64 = async (blob: Blob): Promise<string> => { const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); };
/** Writes the file to the app cache and opens Android's share sheet (Drive, Files, email…). */
export async function shareNative(name: string, blob: Blob): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem"); const { Share } = await import("@capacitor/share");
  const f = await Filesystem.writeFile({ path: name.replace(/[^\w.\- ]/g, "_"), data: await toBase64(blob), directory: Directory.Cache });
  await Share.share({ title: name, url: f.uri, dialogTitle: "Save or share this file" });
}

export async function nativePermission(): Promise<"granted" | "denied" | "prompt"> {
  const { LocalNotifications } = await import("@capacitor/local-notifications"); const r = await LocalNotifications.checkPermissions();
  return r.display === "granted" ? "granted" : r.display === "denied" ? "denied" : "prompt";
}
export async function requestNativePermission(): Promise<boolean> { const { LocalNotifications } = await import("@capacitor/local-notifications"); return (await LocalNotifications.requestPermissions()).display === "granted"; }

/** Replaces every scheduled notification with the given plan (works with the app closed). */
export async function syncNativeReminders(list: Reminder[]): Promise<number> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending(); if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!list.length || (await nativePermission()) !== "granted") return 0;
  await LocalNotifications.createChannel({ id: CHANNEL, name: "Task reminders", description: "Reminders before your scheduled tasks", importance: 4 });
  await LocalNotifications.schedule({ notifications: list.map((r) => ({ id: r.id, title: r.title, body: r.body, schedule: { at: r.at, allowWhileIdle: true }, channelId: CHANNEL })) });
  return list.length;
}
