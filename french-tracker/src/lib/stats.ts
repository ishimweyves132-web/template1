// Pure calculations. Everything is derived from stored sessions/marks; nothing is estimated.
import { addDays, diffDays, range, weekStart, monthStart, addMonths, type DateStr } from "./dates";
import { ACTIVITIES, markKey, type Activity, type Mark, type Session, type TargetEra, type Targets } from "./model";

export interface DayRecord { total: number; sessions: number; by: Record<Activity, number> }
export interface Ledger { days: Map<DateStr, DayRecord>; marks: Set<string>; first: DateStr | null }

const emptyBy = (): Record<Activity, number> =>
  Object.fromEntries(ACTIVITIES.map((a) => [a, 0])) as Record<Activity, number>;

export function buildLedger(sessions: Session[], marks: Mark[]): Ledger {
  const days = new Map<DateStr, DayRecord>();
  let first: DateStr | null = null;
  for (const s of sessions) {
    let d = days.get(s.date);
    if (!d) days.set(s.date, (d = { total: 0, sessions: 0, by: emptyBy() }));
    d.total += s.minutes;
    d.sessions += 1;
    d.by[s.activity] += s.minutes;
    if (!first || s.date < first) first = s.date;
  }
  for (const m of marks) if (!first || m.date < first) first = m.date;
  return { days, marks: new Set(marks.map((m) => m.key)), first };
}

export function targetsOn(history: TargetEra[], date: DateStr): Targets {
  let best = history[0]!;
  for (const e of history) if (e.from <= date && e.from >= best.from) best = e;
  return best.targets;
}

export type ActivityState = "done" | "partial" | "missed" | "extra" | "off";
export interface ActivityEval { activity: Activity; target: number; achieved: number; state: ActivityState; marked: boolean }
export interface DayEval {
  date: DateStr;
  total: number;            // all minutes studied, uncapped
  targetTotal: number;      // sum of daily targets
  timePct: number;          // 0..100, each activity capped at its own target
  items: ActivityEval[];
  completed: number; partial: number; missed: number;
  state: "none" | "partial" | "complete";
}

export function evalDay(ledger: Ledger, history: TargetEra[], date: DateStr): DayEval {
  const rec = ledger.days.get(date);
  const targets = targetsOn(history, date);
  let capped = 0, targetTotal = 0, completed = 0, partial = 0, missed = 0;
  const items: ActivityEval[] = ACTIVITIES.map((activity) => {
    const target = targets[activity];
    const achieved = rec?.by[activity] ?? 0;
    const marked = ledger.marks.has(markKey(date, activity));
    let state: ActivityState;
    if (target <= 0) state = achieved > 0 ? "extra" : "off";
    else if (achieved >= target || marked) state = "done";
    else if (achieved > 0) state = "partial";
    else state = "missed";
    if (target > 0) {
      targetTotal += target;
      capped += marked ? target : Math.min(achieved, target);
      if (state === "done") completed++; else if (state === "partial") partial++; else missed++;
    }
    return { activity, target, achieved, state, marked };
  });
  const total = rec?.total ?? 0;
  const anyMark = items.some((i) => i.marked);
  const state: DayEval["state"] =
    targetTotal > 0 && missed === 0 && partial === 0 ? "complete"
    : targetTotal === 0 && total > 0 ? "complete"
    : total > 0 || anyMark ? "partial" : "none";
  return {
    date, total, targetTotal, items, completed, partial, missed, state,
    timePct: targetTotal > 0 ? Math.round((capped / targetTotal) * 100) : 0,
  };
}

/** A day counts as "studied" when any minutes were logged. */
const studied = (l: Ledger, d: DateStr) => (l.days.get(d)?.total ?? 0) > 0;

export function streaks(l: Ledger, today: DateStr, has: (d: DateStr) => boolean = (d) => studied(l, d)) {
  // Current: counts back from today; an empty *today* does not break the streak yet.
  let cur = 0;
  let d = has(today) ? today : addDays(today, -1);
  while (has(d)) { cur++; d = addDays(d, -1); }
  let longest = 0, run = 0;
  const dates = [...l.days.keys()].filter(has).sort();
  let prev: DateStr | null = null;
  for (const x of dates) {
    run = prev && diffDays(prev, x) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = x;
  }
  return { current: cur, longest };
}

export interface ActivitySummary { achieved: number; target: number; daysHit: number; daysPracticed: number }
export interface PeriodSummary {
  from: DateStr; to: DateStr;
  days: number;            // tracked days in the window (clipped to first record … today)
  total: number; sessions: number; daysStudied: number; avgPerDay: number; consistency: number;
  targetTotal: number; timePct: number;
  byActivity: Record<Activity, ActivitySummary>;
}

export function summarize(l: Ledger, history: TargetEra[], from: DateStr, to: DateStr, today: DateStr): PeriodSummary {
  const start = l.first && l.first > from ? l.first : from;
  const end = to > today ? today : to;
  const by = Object.fromEntries(
    ACTIVITIES.map((a) => [a, { achieved: 0, target: 0, daysHit: 0, daysPracticed: 0 }]),
  ) as Record<Activity, ActivitySummary>;
  let total = 0, sessions = 0, daysStudied = 0, targetTotal = 0, capped = 0, days = 0;
  if (l.first && start <= end) {
    for (const d of range(start, end)) {
      days++;
      const e = evalDay(l, history, d);
      const rec = l.days.get(d);
      total += e.total; sessions += rec?.sessions ?? 0;
      if (e.total > 0) daysStudied++;
      targetTotal += e.targetTotal;
      capped += (e.timePct / 100) * e.targetTotal;
      for (const it of e.items) {
        const s = by[it.activity];
        s.achieved += it.achieved; s.target += it.target;
        if (it.achieved > 0) s.daysPracticed++;
        if (it.state === "done") s.daysHit++;
      }
    }
  }
  return {
    from: start, to: end, days, total, sessions, daysStudied,
    avgPerDay: days ? total / days : 0,
    consistency: days ? Math.round((daysStudied / days) * 100) : 0,
    targetTotal, timePct: targetTotal ? Math.round((capped / targetTotal) * 100) : 0,
    byActivity: by,
  };
}

export interface Bar { label: string; from: DateStr; to: DateStr; minutes: number; target: number }
export function bars(l: Ledger, history: TargetEra[], unit: "day" | "week" | "month", count: number, today: DateStr): Bar[] {
  const out: Bar[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let from: DateStr, to: DateStr;
    if (unit === "day") from = to = addDays(today, -i);
    else if (unit === "week") { from = addDays(weekStart(today), -7 * i); to = addDays(from, 6); }
    else { from = addMonths(monthStart(today), -i); to = addDays(addMonths(from, 1), -1); }
    const s = summarize(l, history, from, to, today);
    out.push({ label: from, from, to, minutes: s.total, target: s.targetTotal });
  }
  return out;
}

export function lastPracticed(l: Ledger, activity: Activity, today: DateStr): DateStr | null {
  let best: DateStr | null = null;
  for (const [d, r] of l.days) if (d <= today && r.by[activity] > 0 && (!best || d > best)) best = d;
  return best;
}

export function overall(l: Ledger) {
  let total = 0, sessions = 0, days = 0;
  for (const r of l.days.values()) { total += r.total; sessions += r.sessions; if (r.total > 0) days++; }
  return { total, sessions, days };
}
