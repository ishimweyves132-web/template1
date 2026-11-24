// Which notifications the Android app should have scheduled. Pure, so it is unit-tested. Re-planned from scratch every time.
import { addDays, type DateStr } from "./dates";
import type { Occurrence, Session, Task } from "./model";
import { minToHM } from "./dates";

export interface Reminder { id: number; at: Date; title: string; body: string }
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 2000 + (Math.abs(h) % 1_000_000); };
const at = (date: DateStr, min: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(y!, m! - 1, d!, Math.floor(min / 60), min % 60, 0, 0); };

/** Reminders for approved sessions of unfinished work in the next `days` days that are still in the future. Capped (Android keeps ~500 alarms). */
export function planSessionReminders(sessions: Session[], occurrences: Occurrence[], tasks: Task[], today: DateStr, now: Date, leadMin: number, days = 14): Reminder[] {
  const live = new Map(occurrences.filter((o) => o.status === "planned" || o.status === "in-progress").map((o) => [o.id, o])); const end = addDays(today, days); const out: Reminder[] = [];
  for (const s of sessions) {
    if (s.state !== "approved" || s.date < today || s.date > end) continue; const o = live.get(s.occId); if (!o) continue;
    const when = at(s.date, Math.max(0, s.startMin - Math.max(0, leadMin))); if (when.getTime() <= now.getTime() + 5000) continue;
    const t = tasks.find((x) => x.id === o.taskId); out.push({ id: hash(s.id), at: when, title: leadMin > 0 ? "Up next" : "Starting now", body: `${t?.title ?? "Task"} at ${minToHM(s.startMin)}` });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 200);
}
