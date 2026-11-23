// Recurring tasks produce occurrences on demand for a bounded window; unlimited future records are never created.
import { addDays, addMonthsKeepDay, diffDays, range, weekdayIndex, type DateStr } from "../lib/dates";
import type { Recurrence, Task } from "../lib/model";

/** Dates (within [from, to]) on which a recurrence fires. `count` limits the total number of repetitions since the recurrence started. */
export function recurrenceDates(r: Recurrence, from: DateStr, to: DateStr): DateStr[] {
  if (r.kind === "none" || r.paused) return [];
  const out: DateStr[] = []; const step = Math.max(1, r.interval || 1);
  const matches = (d: DateStr): boolean => {
    if (d < r.start) return false; if (r.until && d > r.until) return false;
    const n = diffDays(r.start, d);
    switch (r.kind) {
      case "daily": return n % step === 0;
      case "weekdays": return weekdayIndex(d) < 5;
      case "weekly": return (r.days.length ? r.days.includes(weekdayIndex(d)) : weekdayIndex(d) === weekdayIndex(r.start)) && Math.floor(diffDays(startOfWeek(r.start), d) / 7) % step === 0;
      case "monthly": return sameDayOfMonth(d, r.start, step);
      default: return false;
    }
  };
  let fired = 0;
  // count must be evaluated from the recurrence start, not from the window start
  for (const d of range(r.start, to > r.start ? to : r.start)) {
    if (!matches(d)) continue; fired++;
    if (r.count !== null && fired > r.count) break;
    if (d >= from && d <= to) out.push(d);
  }
  return out;
}
const startOfWeek = (d: DateStr): DateStr => addDays(d, -weekdayIndex(d));
function sameDayOfMonth(d: DateStr, start: DateStr, step: number): boolean {
  const months = (Number(d.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + (Number(d.slice(5, 7)) - Number(start.slice(5, 7)));
  return months >= 0 && months % step === 0 && d === addMonthsKeepDay(start, months);
}
/** The day(s) a task should appear in the plan inside [from, to]. One-off tasks use `onDate`. */
export function taskDates(t: Task, from: DateStr, to: DateStr): DateStr[] {
  if (t.status !== "active") return [];
  if (t.recurrence && t.recurrence.kind !== "none") return recurrenceDates(t.recurrence, from, to);
  return t.onDate && t.onDate >= from && t.onDate <= to ? [t.onDate] : [];
}
