import type { ReminderSettings } from "./model";

/** True when the reminder time has passed today, no practice is logged, and we have not already nudged today. */
export function reminderDue(now: Date, r: ReminderSettings, studiedToday: boolean, today: string): boolean {
  if (!r.enabled || studiedToday || r.lastShown === today) return false;
  const [h = 19, m = 0] = r.time.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
}
export const REMINDER_TEXT = { title: "French today?", body: "A short session is enough — even 10 minutes counts." };

export async function showReminder() {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker?.getRegistration();
  if (reg) await reg.showNotification(REMINDER_TEXT.title, { body: REMINDER_TEXT.body, tag: "daily-reminder", icon: "./icon-192.png" });
  else new Notification(REMINDER_TEXT.title, { body: REMINDER_TEXT.body });
  return true;
}

/**
 * Upcoming reminder times for the native app: one per day for the next `days` days at the chosen time,
 * skipping times already past, and skipping today if practice is already logged.
 */
export function planReminders(now: Date, time: string, studiedToday: boolean, days = 14): Date[] {
  const [h = 19, m = 0] = time.split(":").map(Number);
  const out: Date[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m, 0, 0);
    if (d <= now || (i === 0 && studiedToday)) continue;
    out.push(d);
  }
  return out;
}
