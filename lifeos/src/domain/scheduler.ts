// Deterministic scheduling. AI (or the user) may suggest; this module validates and places. Same input -> same output.
import { addDays, diffDays, weekdayIndex, type DateStr } from "../lib/dates";
import type { Preferred, Rules } from "../lib/model";

export interface Busy { startMin: number; endMin: number; kind: "external" | "commitment" | "session" | "protected"; id?: string }
export interface Item {
  occId: string; taskId: string; date: DateStr; estimateMin: number; priority: 1 | 2 | 3 | 4; deadline: DateStr | null;
  earliestStart: DateStr | null; preferred: Preferred; flexibility: "fixed" | "flexible";
}
export interface Placement { occId: string; taskId: string; date: DateStr; startMin: number; endMin: number; why: string }
export interface Unplaced { occId: string; reason: string }
export interface Context {
  rules: Rules; today: DateStr; now: number;                       // now = minutes since midnight today
  busy: (date: DateStr) => Busy[];                                  // everything that blocks time that day (events, commitments, approved sessions)
}
const WINDOWS: Record<Preferred, [number, number]> = { any: [0, 1440], morning: [0, 12 * 60], afternoon: [12 * 60, 17 * 60], evening: [17 * 60, 1440] };
const ceil5 = (m: number) => Math.ceil(m / 5) * 5;

export interface Interval { start: number; end: number }
/** Free time on a day inside working hours, with the configured buffer kept around every busy block. Empty on non-working days. */
export function freeIntervals(date: DateStr, ctx: Context, extra: Busy[] = []): Interval[] {
  const { rules } = ctx;
  if (!rules.allowedDays.includes(weekdayIndex(date))) return [];
  let start = rules.workStart; const end = rules.workEnd;
  if (date === ctx.today) start = Math.max(start, ceil5(ctx.now));
  if (date < ctx.today) return [];
  const blocks = [...ctx.busy(date), ...extra].map((b) => ({ s: b.startMin - rules.bufferMin, e: b.endMin + rules.bufferMin })).sort((a, b) => a.s - b.s);
  const free: Interval[] = []; let cur = start;
  for (const b of blocks) { if (b.s > cur) free.push({ start: cur, end: Math.min(b.s, end) }); cur = Math.max(cur, b.e); if (cur >= end) break; }
  if (cur < end) free.push({ start: cur, end });
  return free.map((f) => ({ start: ceil5(f.start), end: f.end })).filter((f) => f.end - f.start > 0);
}
const scheduledMinutes = (b: Busy[]) => b.filter((x) => x.kind === "session").reduce((a, x) => a + (x.endMin - x.startMin), 0);

export interface Window { from: DateStr; to: DateStr }
/** Why a placement is not allowed, or null if it is valid. Used for the scheduler's own output, manual moves and AI proposals alike. */
export function violation(p: { date: DateStr; startMin: number; endMin: number }, it: Pick<Item, "deadline" | "earliestStart" | "estimateMin">, ctx: Context, extra: Busy[] = []): string | null {
  const { rules } = ctx;
  if (p.endMin <= p.startMin) return "end must be after start";
  if (p.endMin - p.startMin < it.estimateMin) return "shorter than the task's estimate";
  if (p.date < ctx.today) return "in the past";
  if (p.date === ctx.today && p.startMin < ctx.now) return "already started";
  if (!rules.allowedDays.includes(weekdayIndex(p.date))) return "not an allowed working day";
  if (p.startMin < rules.workStart || p.endMin > rules.workEnd) return "outside working hours";
  if (it.deadline && p.date > it.deadline) return "after the deadline";
  if (it.earliestStart && p.date < it.earliestStart) return "before the earliest start";
  const day = [...ctx.busy(p.date), ...extra];
  if (scheduledMinutes(day) + (p.endMin - p.startMin) > rules.maxDailyMin) return "exceeds the daily capacity";
  for (const b of day) if (p.startMin < b.endMin + rules.bufferMin && p.endMin > b.startMin - rules.bufferMin) return `overlaps ${b.kind === "external" ? "a calendar event" : b.kind === "session" ? "another scheduled task" : "a commitment"}`;
  return null;
}

function itemWindow(it: Item, win: Window, ctx: Context): Window | null {
  if (it.flexibility === "fixed") { const d = it.date < ctx.today ? ctx.today : it.date; return d >= win.from && d <= win.to ? { from: d, to: d } : null; }
  let from = it.date; if (it.earliestStart && it.earliestStart > from) from = it.earliestStart; if (from < win.from) from = win.from; if (from < ctx.today) from = ctx.today;
  let to = win.to; if (it.deadline && it.deadline < to) to = it.deadline;
  return from <= to ? { from, to } : null;
}

/** Places each item in the earliest valid slot, preferring its preferred time of day. Items are ranked by deadline, then priority, then length. */
export function proposeSchedule(items: Item[], ctx: Context, win: Window): { placements: Placement[]; unplaced: Unplaced[] } {
  const placed: Placement[] = []; const unplaced: Unplaced[] = [];
  const extra = new Map<DateStr, Busy[]>(); const add = (d: DateStr, b: Busy) => extra.set(d, [...(extra.get(d) ?? []), b]);
  const ranked = [...items].sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.priority - b.priority || b.estimateMin - a.estimateMin || a.occId.localeCompare(b.occId));
  for (const it of ranked) {
    const w = itemWindow(it, win, ctx);
    if (!w) { unplaced.push({ occId: it.occId, reason: it.deadline && it.deadline < ctx.today ? "the deadline has already passed" : "no day available inside the allowed window" }); continue; }
    let reason = "no free time before the deadline"; let sawCapacity = false, sawTooLong = false, sawDay = false; let done = false;
    for (let d = w.from; d <= w.to && !done; d = addDays(d, 1)) {
      if (!ctx.rules.allowedDays.includes(weekdayIndex(d))) continue; sawDay = true;
      const ex = extra.get(d) ?? [];
      if (scheduledMinutes([...ctx.busy(d), ...ex]) + it.estimateMin > ctx.rules.maxDailyMin) { sawCapacity = true; continue; }
      const free = freeIntervals(d, ctx, ex);
      const fits = free.filter((f) => f.end - f.start >= it.estimateMin);
      if (!fits.length) { if (free.length) sawTooLong = true; continue; }
      const [ws, we] = WINDOWS[it.preferred];
      const pick = (lo: number, hi: number) => { for (const f of fits) { const s = Math.max(f.start, lo); const e = Math.min(f.end, hi); if (e - s >= it.estimateMin) return ceil5(s) + it.estimateMin <= f.end ? ceil5(s) : null; } return null; };
      const start = (it.preferred !== "any" ? pick(ws, we) : null) ?? pick(0, 1440);
      if (start === null) continue;
      const p: Placement = { occId: it.occId, taskId: it.taskId, date: d, startMin: start, endMin: start + it.estimateMin, why: it.preferred !== "any" && start >= ws && start < we ? `first free ${it.preferred} slot` : "first free slot" };
      if (violation(p, it, ctx, ex)) continue;     // belt and braces: the engine never returns something its own validator rejects
      placed.push(p); add(d, { startMin: p.startMin, endMin: p.endMin, kind: "session", id: it.occId }); done = true;
    }
    if (!done) {
      if (!sawDay) reason = "no allowed working day in the window"; else if (sawTooLong && !sawCapacity) reason = "longer than any free block (split the task)"; else if (sawCapacity && !sawTooLong) reason = "the daily capacity is already used"; else reason = "no free time before the deadline";
      unplaced.push({ occId: it.occId, reason });
    }
  }
  return { placements: placed, unplaced };
}
export const daysBetween = diffDays;
