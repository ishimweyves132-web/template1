// Four separate dimensions. A goal can have excellent execution and poor outcome: that gap must stay visible.
import { addDays, range, weekdayIndex, type DateStr } from "../lib/dates";
import type { Evidence, Execution, Habit, HabitLog, Objective, Occurrence, Task } from "../lib/model";

export interface ExecStats { done: number; partial: number; missed: number; skipped: number; open: number; resolved: number; doneRate: number | null; plannedMin: number; actualMin: number }
export function executionStats(occs: Occurrence[], tasks: Task[], execs: Execution[], from: DateStr, to: DateStr, today: DateStr): ExecStats {
  const inRange = occs.filter((o) => o.date >= from && o.date <= to && o.status !== "cancelled");
  const c = { done: 0, partial: 0, missed: 0, skipped: 0, open: 0 };
  let plannedMin = 0;
  for (const o of inRange) {
    const t = tasks.find((x) => x.id === o.taskId);
    if (o.status === "done") c.done++; else if (o.status === "partial") c.partial++; else if (o.status === "skipped") c.skipped++;
    else if (o.status === "missed" || (o.date < today && (o.status === "planned" || o.status === "in-progress"))) c.missed++; else c.open++;
    if (t && (o.status === "done" || o.status === "partial" || o.status === "skipped" || o.status === "missed" || (o.date < today && o.status !== "cancelled"))) plannedMin += t.estimateMin;
  }
  const actualMin = execs.filter((e) => e.date >= from && e.date <= to).reduce((a, e) => a + e.minutes, 0);
  const resolved = c.done + c.partial + c.missed + c.skipped;
  return { ...c, resolved, doneRate: resolved ? c.done / resolved : null, plannedMin, actualMin };
}

export interface HabitStat { habit: Habit; due: number; done: number; rate: number | null; streak: number }
export function habitStats(habits: Habit[], logs: HabitLog[], from: DateStr, to: DateStr, today: DateStr): HabitStat[] {
  return habits.filter((h) => !h.archived).map((h) => {
    const dueDays = range(from, to > today ? today : to).filter((d) => h.days.length === 0 || h.days.includes(weekdayIndex(d)));
    const set = new Set(logs.filter((l) => l.habitId === h.id).map((l) => l.date));
    const done = dueDays.filter((d) => set.has(d)).length;
    // streak counts back over due days; today not yet logged does not break it
    let streak = 0; const back = [...dueDays].reverse();
    for (let i = 0; i < back.length; i++) { if (set.has(back[i]!)) streak++; else if (i === 0 && back[i] === today) continue; else break; }
    return { habit: h, due: dueDays.length, done, rate: dueDays.length ? done / dueDays.length : null, streak };
  });
}
export const habitDueToday = (h: Habit, today: DateStr) => h.days.length === 0 || h.days.includes(weekdayIndex(today));

export interface EvidenceGap { objective: Objective; count: number }
export function evidenceGaps(objs: Objective[], evidence: Evidence[]): EvidenceGap[] {
  return objs.filter((o) => o.evidenceRequired && (o.status === "active" || o.status === "completed")).map((o) => ({ objective: o, count: evidence.filter((e) => e.objectiveId === o.id).length })).filter((g) => g.count === 0);
}

/** Optional weighted summary. Every weight is returned with the score so the user can see exactly how it was made. */
export function weightedSummary(scores: { name: string; value: number | null; weight: number }[]): { value: number | null; parts: { name: string; value: number; weight: number }[] } {
  const parts = scores.filter((s): s is { name: string; value: number; weight: number } => s.value !== null && s.weight > 0);
  const w = parts.reduce((a, p) => a + p.weight, 0);
  return { value: w ? parts.reduce((a, p) => a + p.value * p.weight, 0) / w : null, parts };
}
export const weekRange = (today: DateStr): { from: DateStr; to: DateStr } => { const from = addDays(today, -weekdayIndex(today)); return { from, to: addDays(from, 6) }; };
