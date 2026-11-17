// Factual observations from stored records only. No scores, no proficiency claims.
import { addDays, diffDays, formatDate, range, type DateStr } from "./dates";
import { ACTIVITIES, ACTIVITY_LABEL, type Activity, type TargetEra } from "./model";
import { evalDay, lastPracticed, targetsOn, type Ledger } from "./stats";

export interface Observation { level: "attention" | "note" | "good"; activity?: Activity; text: string }
export interface ActivityRow {
  activity: Activity; target: number; daysTracked: number;
  daysHit: number; daysPracticed: number; achieved: number; possible: number;
  pctOfTarget: number; lastDate: DateStr | null; daysSince: number | null;
}

const WINDOW = 14;

export function activityRows(l: Ledger, history: TargetEra[], today: DateStr): ActivityRow[] {
  const from = l.first && l.first > addDays(today, -(WINDOW - 1)) ? l.first : addDays(today, -(WINDOW - 1));
  const days = l.first ? range(from, today) : [];
  return ACTIVITIES.map((activity) => {
    let daysHit = 0, daysPracticed = 0, achieved = 0, possible = 0;
    for (const d of days) {
      const it = evalDay(l, history, d).items.find((i) => i.activity === activity)!;
      achieved += it.achieved; possible += it.target;
      if (it.achieved > 0) daysPracticed++;
      if (it.state === "done") daysHit++;
    }
    const last = lastPracticed(l, activity, today);
    return {
      activity, target: targetsOn(history, today)[activity], daysTracked: days.length,
      daysHit, daysPracticed, achieved, possible,
      pctOfTarget: possible ? Math.min(100, Math.round((achieved / possible) * 100)) : 0,
      lastDate: last, daysSince: last ? diffDays(last, today) : null,
    };
  });
}

export function observations(l: Ledger, history: TargetEra[], today: DateStr): Observation[] {
  const out: Observation[] = [];
  if (!l.first) return out;
  const rows = activityRows(l, history, today);
  const tracked = rows[0]?.daysTracked ?? 0;
  const L = ACTIVITY_LABEL;
  const withTarget = rows.filter((r) => r.target > 0);

  // 6. Stop-start pattern: gaps of 3+ days inside the tracked period
  const gaps: { from: DateStr; to: DateStr; len: number }[] = [];
  let gapStart: DateStr | null = null;
  const end = addDays(today, -1);
  if (end >= l.first) {
    for (const d of range(l.first, end)) {
      const has = (l.days.get(d)?.total ?? 0) > 0;
      if (!has && gapStart === null) gapStart = d;
      if (has && gapStart !== null) { gaps.push({ from: gapStart, to: addDays(d, -1), len: diffDays(gapStart, d) }); gapStart = null; }
    }
    if (gapStart !== null) gaps.push({ from: gapStart, to: end, len: diffDays(gapStart, end) + 1 });
  }
  const pausedNow = gaps.some((g) => g.len >= 3 && g.to === end);

  // 1. Not practised recently (needs at least 3 days of history so a new user is not nagged)
  if (diffDays(l.first, today) >= 3) {
    for (const r of rows) {
      if (r.target <= 0 && r.lastDate === null) continue;
      if (r.lastDate === null) {
        out.push({ level: "attention", activity: r.activity, text: `${L[r.activity]}: no session recorded yet.` });
      } else if (r.daysSince! >= 3 && !pausedNow) {
        out.push({ level: "attention", activity: r.activity,
          text: `${L[r.activity]}: last practised ${r.daysSince} days ago (${formatDate(r.lastDate)}).` });
      }
    }
  }

  // 2. Least practised (relative to own target, last 14 days)
  if (tracked >= 3 && withTarget.length > 1) {
    const sorted = [...withTarget].sort((a, b) => a.pctOfTarget - b.pctOfTarget);
    const worst = sorted[0]!, best = sorted[sorted.length - 1]!;
    if (worst.pctOfTarget < 50 && best.pctOfTarget - worst.pctOfTarget >= 30) {
      out.push({ level: "attention", activity: worst.activity,
        text: `Least practised: ${L[worst.activity]} reached ${worst.pctOfTarget}% of its target over the last ${tracked} days, while ${L[best.activity]} reached ${best.pctOfTarget}%.` });
    }
  }

  // 3. Declining consistency: days practised in last 7 vs the 7 before
  if (diffDays(l.first, today) >= 10) {
    for (const r of withTarget) {
      let recent = 0, prev = 0;
      for (let i = 0; i < 7; i++) {
        if ((l.days.get(addDays(today, -i))?.by[r.activity] ?? 0) > 0) recent++;
        if ((l.days.get(addDays(today, -7 - i))?.by[r.activity] ?? 0) > 0) prev++;
      }
      if (prev >= 3 && recent <= prev - 2) {
        out.push({ level: "attention", activity: r.activity,
          text: `${L[r.activity]} is declining: practised on ${recent} of the last 7 days, compared with ${prev} of the 7 days before.` });
      }
    }
  }

  // 4. Repeatedly missed targets (last 7 tracked days)
  const weekFrom = addDays(today, -6) < l.first ? l.first : addDays(today, -6);
  const week = range(weekFrom, addDays(today, -1) >= weekFrom ? addDays(today, -1) : weekFrom).filter((d) => d < today);
  if (week.length >= 4 && !pausedNow) {
    for (const r of withTarget) {
      const missed = week.filter((d) => evalDay(l, history, d).items.find((i) => i.activity === r.activity)!.state !== "done").length;
      if (missed >= Math.max(4, week.length - 1)) {
        out.push({ level: "attention", activity: r.activity,
          text: `${L[r.activity]} target (${r.target} min) not met on ${missed} of the last ${week.length} days.` });
      }
    }
  }

  // 5. Unfinished targets
  const unfinished = week.filter((d) => evalDay(l, history, d).state === "partial").length;
  if (unfinished >= 2) {
    out.push({ level: "note", text: `${unfinished} of the last ${week.length} days ended with the daily target only partly done.` });
  }

  // 6. Stop-start pattern: gaps of 3+ days inside the tracked period
  const recentGaps = gaps.filter((g) => g.len >= 3 && g.to >= addDays(today, -60));
  if (recentGaps.length) {
    const g = recentGaps[recentGaps.length - 1]!;
    const stillOn = g.to === end;
    out.push({ level: stillOn ? "attention" : "note",
      text: stillOn
        ? `No practice logged for ${g.len} days (${formatDate(g.from)} – ${formatDate(g.to)}), last practised ${formatDate(addDays(g.from, -1))}. One short session today is enough to resume.`
        : `Longest recent pause: ${g.len} days (${formatDate(g.from)} – ${formatDate(g.to)}). ${recentGaps.length > 1 ? `${recentGaps.length} pauses of 3+ days in the last 60 days.` : ""}`.trim() });
  }


  // 7. Positives, stated just as factually
  for (const r of withTarget) {
    if (r.daysTracked >= 7 && r.daysHit >= Math.ceil(r.daysTracked * 0.8)) {
      out.push({ level: "good", activity: r.activity, text: `${L[r.activity]}: target met on ${r.daysHit} of ${r.daysTracked} days.` });
    }
  }
  return out;
}

export const DISCLAIMER =
  "These observations count minutes and days you recorded. Time spent is not the same as proficiency, so use them to adjust your routine, not to judge your French.";
