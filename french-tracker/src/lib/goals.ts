import { addDays, diffDays, formatMinutes, hours, type DateStr } from "./dates";
import { ACTIVITIES, ACTIVITY_LABEL, type Activity, type Challenge, type Goal, type Session, type VocabEntry, type TargetEra } from "./model";
import { buildLedger, evalDay, overall, streaks, type Ledger } from "./stats";
import { CHALLENGE_LENGTH } from "./challenge";

export interface GoalProgress { current: number; target: number; pct: number; done: boolean; unit: string; label: string }

export function goalProgress(g: Goal, sessions: Session[], vocab: VocabEntry[], today: DateStr): GoalProgress {
  const rel = sessions.filter((s) => s.date >= g.startDate && (g.activity === "any" || s.activity === g.activity));
  let current = 0, unit = "", label = "";
  const what = g.activity === "any" ? "French" : ACTIVITY_LABEL[g.activity].toLowerCase();
  switch (g.kind) {
    case "minutes":
      current = rel.reduce((a, s) => a + s.minutes, 0); unit = "min";
      label = `${hours(current)} of ${hours(g.target)} h of ${what}`; break;
    case "sessions":
      current = rel.length; unit = "sessions"; label = `${current} of ${g.target} ${what} sessions`; break;
    case "streak": {
      const only = new Set(rel.filter((s) => s.minutes > 0).map((s) => s.date));
      const l = buildLedger(rel, []);
      current = streaks(l, today, (d) => only.has(d)).longest; unit = "days";
      label = `best run ${current} of ${g.target} consecutive days of ${what}`; break;
    }
    case "vocab":
      current = vocab.filter((v) => v.addedAt >= g.startDate && (g.vocabStatus === "any" || v.status === g.vocabStatus)).length;
      unit = "items"; label = `${current} of ${g.target} ${g.vocabStatus === "learned" ? "learned " : ""}words & expressions`; break;
    case "counter":
      current = g.manualCount; unit = "done"; label = `${current} of ${g.target}`; break;
  }
  return { current, target: g.target, pct: g.target ? Math.min(100, Math.floor((current / g.target) * 100)) : 0, done: current >= g.target, unit, label };
}

export interface Badge { id: string; title: string; description: string; earnedOn: DateStr | null; progress: string }
export interface Records { longestStreak: number; bestDay: { date: DateStr; minutes: number } | null; bestWeek: { from: DateStr; minutes: number } | null; mostSessionsDay: { date: DateStr; n: number } | null }

export function personalRecords(l: Ledger, today: DateStr): Records {
  let bestDay: Records["bestDay"] = null, most: Records["mostSessionsDay"] = null;
  for (const [d, r] of l.days) {
    if (!bestDay || r.total > bestDay.minutes) bestDay = { date: d, minutes: r.total };
    if (!most || r.sessions > most.n) most = { date: d, n: r.sessions };
  }
  let bestWeek: Records["bestWeek"] = null;
  const byWeek = new Map<DateStr, number>();
  for (const [d, r] of l.days) {
    const ws = addDays(d, -((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7));
    byWeek.set(ws, (byWeek.get(ws) ?? 0) + r.total);
  }
  for (const [w, m] of byWeek) if (!bestWeek || m > bestWeek.minutes) bestWeek = { from: w, minutes: m };
  return { longestStreak: streaks(l, today).longest, bestDay, bestWeek, mostSessionsDay: most };
}

/** Date on which a running total first reached `n`. */
function crossing(l: Ledger, n: number, f: (d: string) => number): DateStr | null {
  let sum = 0;
  for (const d of [...l.days.keys()].sort()) { sum += f(d); if (sum >= n) return d; }
  return null;
}
function streakReached(l: Ledger, n: number): DateStr | null {
  let run = 0, prev: DateStr | null = null;
  for (const d of [...l.days.keys()].filter((x) => (l.days.get(x)?.total ?? 0) > 0).sort()) {
    run = prev && diffDays(prev, d) === 1 ? run + 1 : 1;
    if (run >= n) return d;
    prev = d;
  }
  return null;
}

/**
 * Badges are derived from real records (never stored), so they can never be "awarded" for a trivial tap.
 * Each one needs sustained effort.
 */
export function badges(sessions: Session[], vocab: VocabEntry[], challenges: Challenge[], history: TargetEra[], today: DateStr): Badge[] {
  const l = buildLedger(sessions, []);
  const tot = overall(l);
  const out: Badge[] = [];
  const add = (id: string, title: string, description: string, earnedOn: DateStr | null, progress: string) =>
    out.push({ id, title, description, earnedOn, progress });

  for (const n of [7, 14, 30, 60]) {
    add(`streak-${n}`, `${n}-day streak`, `Studied on ${n} days in a row.`, streakReached(l, n), `longest ${Math.min(streaks(l, today).longest, n)}/${n}`);
  }
  for (const h of [10, 50, 100, 250]) {
    add(`hours-${h}`, `${h} hours of French`, `${h} hours of recorded practice in total.`, crossing(l, h * 60, (d) => l.days.get(d)!.total), `${hours(Math.min(tot.total, h * 60))}/${h} h`);
  }
  // Full-target days
  const full: DateStr[] = [];
  if (l.first) for (let d = l.first; d <= today; d = addDays(d, 1)) if (evalDay(l, history, d).state === "complete" && evalDay(l, history, d).targetTotal > 0) full.push(d);
  add("full-10", "10 full-target days", "Met every daily target on 10 different days.", full[9] ?? null, `${Math.min(full.length, 10)}/10`);
  add("full-30", "30 full-target days", "Met every daily target on 30 different days.", full[29] ?? null, `${Math.min(full.length, 30)}/30`);
  // Per-activity commitment: 20 distinct days
  for (const a of ACTIVITIES) {
    const dates = [...l.days.entries()].filter(([, r]) => r.by[a as Activity] > 0).map(([d]) => d).sort();
    add(`days-${a}`, `20 days of ${ACTIVITY_LABEL[a].toLowerCase()}`, `Practised ${ACTIVITY_LABEL[a].toLowerCase()} on 20 different days.`, dates[19] ?? null, `${Math.min(dates.length, 20)}/20`);
  }
  const learned = vocab.filter((v) => v.status === "learned").length;
  add("vocab-100", "100 words learned", "Marked 100 words or expressions as learned.", learned >= 100 ? today : null, `${Math.min(learned, 100)}/100`);
  const finished = challenges.find((c) => Object.values(c.days).filter((d) => d.done).length === CHALLENGE_LENGTH);
  const lastDone = finished ? Object.values(finished.days).map((d) => d.doneOn ?? "").sort().pop() || today : null;
  add("challenge", "30-day challenge completed", "Completed all 30 days of a challenge.", lastDone, `${Math.max(0, ...challenges.map((c) => Object.values(c.days).filter((d) => d.done).length))}/30`);
  return out;
}

export interface Milestone { title: string; remaining: string; pct: number }
/** The closest upcoming thing worth working toward: an active goal, else the next badge threshold. */
export function nextMilestone(goals: Goal[], sessions: Session[], vocab: VocabEntry[], challenges: Challenge[], history: TargetEra[], today: DateStr): Milestone | null {
  const cands: Milestone[] = [];
  for (const g of goals) {
    if (g.completedAt) continue;
    const p = goalProgress(g, sessions, vocab, today);
    if (!p.done) cands.push({ title: g.title, remaining: p.label, pct: p.pct });
  }
  for (const b of badges(sessions, vocab, challenges, history, today)) {
    if (b.earnedOn) continue;
    const m = /(\d+(?:\.\d+)?)\/(\d+)/.exec(b.progress);
    if (m) cands.push({ title: b.title, remaining: b.progress, pct: Math.floor((Number(m[1]) / Number(m[2])) * 100) });
  }
  cands.sort((a, b) => b.pct - a.pct);
  return cands[0] ?? null;
}
export { formatMinutes };
