// Android (Capacitor) integration. On the web every function here is a harmless no-op / fallback.
// NOTE: the native paths could not be run in the build sandbox (no Android SDK/emulator); see README.
import { Capacitor } from "@capacitor/core";
import type { ReminderSettings } from "./model";
import { REMINDER_TEXT, planReminders } from "./reminders";

export const isNative = () => Capacitor.isNativePlatform();
const CHANNEL = "study-reminders";
const BASE_ID = 1000;

/** Writes a file to the app cache and opens Android's share sheet so it can be saved to Drive/Files/etc. */
export async function shareFile(name: string, text: string) {
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const f = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: name, url: f.uri, dialogTitle: "Save your backup file" });
}

export async function nativePermission(): Promise<"granted" | "denied" | "prompt"> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const r = await LocalNotifications.checkPermissions();
  return r.display === "granted" ? "granted" : r.display === "denied" ? "denied" : "prompt";
}
export async function requestNativePermission(): Promise<boolean> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return (await LocalNotifications.requestPermissions()).display === "granted";
}

/**
 * Schedules real Android notifications for the next 14 days (works with the app closed) and re-plans on every call,
 * so a day you already practised is skipped. Refreshed whenever the app opens or you log practice.
 */
export async function syncNativeReminders(r: ReminderSettings, studiedToday: boolean, now = new Date()) {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!r.enabled || !(await nativePermission().then((p) => p === "granted"))) return 0;
  await LocalNotifications.createChannel({ id: CHANNEL, name: "Study reminders", description: "Gentle daily reminder to practise French", importance: 3 });
  const times = planReminders(now, r.time, studiedToday);
  if (!times.length) return 0;
  await LocalNotifications.schedule({
    notifications: times.map((at, i) => ({ id: BASE_ID + i, title: REMINDER_TEXT.title, body: REMINDER_TEXT.body, schedule: { at, allowWhileIdle: true }, channelId: CHANNEL })),
  });
  return times.length;
}

export async function sendNativeTest() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await LocalNotifications.createChannel({ id: CHANNEL, name: "Study reminders", importance: 3 });
  await LocalNotifications.schedule({ notifications: [{ id: 999, title: REMINDER_TEXT.title, body: REMINDER_TEXT.body, schedule: { at: new Date(Date.now() + 3000) }, channelId: CHANNEL }] });
}
