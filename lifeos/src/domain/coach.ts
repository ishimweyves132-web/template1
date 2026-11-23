// The rule-based coach: deterministic analysis of the user's own records. It proposes; it never changes goals or deadlines.
import { addDays, diffDays, range, type DateStr } from "../lib/dates";
import type { Execution, KeyResult, KrPoint, Objective, Occurrence, Rules, Session, Task } from "../lib/model";
import { objectiveOutcome, pace, type Outcome, type Pace } from "./progress";

export interface Insight { id: string; level: "attention" | "note" | "good"; title: string; detail: string; action?: "plan-week" | "recover" | "open-vision" | "open-planner"; objectiveId?: string }
export interface CoachInput { today: DateStr; rules: Rules; objectives: Objective[]; krs: KeyResult[]; points: KrPoint[]; tasks: Task[]; occurrences: Occurrence[]; sessions: Session[]; executions: Execution[] }

export function analyze(i: CoachInput): Insight[] {
  const out: Insight[] = [];
  const taskOf = new Map(i.tasks.map((t) => [t.id, t]));
  const live = i.occurrences.filter((o) => o.status !== "cancelled");

  // 1. Overload: planned work above the daily capacity the user approved
  for (const d of range(i.today, addDays(i.today, 6))) {
    const mins = live.filter((o) => o.date === d && (o.status === "planned" || o.status === "in-progress")).reduce((a, o) => a + (taskOf.get(o.taskId)?.estimateMin ?? 0), 0);
    if (mins > i.rules.maxDailyMin) out.push({ id: `overload-${d}`, level: "attention", title: `${d} is overloaded`, detail: `${Math.round(mins / 60 * 10) / 10} h planned against a ${Math.round(i.rules.maxDailyMin / 60 * 10) / 10} h daily capacity. Move or drop something, or raise the capacity yourself.`, action: "open-planner" });
  }
  // 2. Missed work waiting for a decision
  const missed = live.filter((o) => o.status === "missed");
  if (missed.length) out.push({ id: "missed", level: "attention", title: `${missed.length} missed task${missed.length === 1 ? "" : "s"}`, detail: "Recovery will move the eligible ones within your rules and ask about the rest.", action: "recover" });
  // 3. Unscheduled work this week
  const unsched = live.filter((o) => o.status === "planned" && o.date >= i.today && o.date <= addDays(i.today, 6) && !i.sessions.some((s) => s.occId === o.id && s.state === "approved"));
  if (unsched.length) out.push({ id: "unscheduled", level: "note", title: `${unsched.length} task${unsched.length === 1 ? " has" : "s have"} no time yet`, detail: "Plan the week to place them around your calendar, then approve the proposal.", action: "plan-week" });
  // 4. Objectives with plans but no recent execution
  for (const o of i.objectives.filter((x) => x.status === "active")) {
    const tids = new Set(i.tasks.filter((t) => t.objectiveId === o.id && t.status === "active").map((t) => t.id));
    if (!tids.size) continue;
    const last = i.executions.filter((e) => tids.has(e.taskId) && e.outcome !== "skipped").map((e) => e.date).sort().pop();
    const idle = last ? diffDays(last, i.today) : null;
    if (idle === null ? diffDays(o.start, i.today) > 7 : idle >= 14) out.push({ id: `neglected-${o.id}`, level: "attention", title: `“${o.title}” ${idle === null ? "has no recorded work yet" : `has had no work for ${idle} days`}`, detail: "It has tasks but nothing recorded recently. Schedule one small step, or pause the objective deliberately.", action: "open-vision", objectiveId: o.id });
  }
  // 5. Outcome pace (separate from execution)
  const aheads: Objective[] = [];
  for (const o of i.objectives.filter((x) => x.status === "active")) {
    const oc: Outcome = objectiveOutcome(o, i.objectives, i.krs, i.points); const p: Pace = pace(o, oc, i.today);
    if (p === "behind" || p === "at-risk") out.push({ id: `pace-${o.id}`, level: "attention", title: `“${o.title}” is ${p === "at-risk" ? "at risk" : "behind"} on outcome`, detail: `${Math.round((oc.fraction ?? 0) * 100)}% of the result with ${Math.round((diffDays(o.start, i.today) / Math.max(1, diffDays(o.start, o.target))) * 100)}% of the time used. Doing the tasks is not the same as getting the result; revisit the strategy, not only the schedule.`, action: "open-vision", objectiveId: o.id });
    else if (p === "ahead") aheads.push(o);
  }
  if (aheads.length) out.push({ id: "ahead", level: "good", title: `${aheads.length} objective${aheads.length === 1 ? " is" : "s are"} ahead of pace`, detail: aheads.slice(0, 3).map((o) => `“${o.title}”`).join(", ") + (aheads.length > 3 ? ` and ${aheads.length - 3} more` : "") + ". Outcome is measured against the time used, not against tasks done.", objectiveId: aheads[0]!.id });
  // 6. Unmeasured active objectives
  const unmeasured = i.objectives.filter((o) => o.status === "active" && objectiveOutcome(o, i.objectives, i.krs, i.points).fraction === null);
  if (unmeasured.length) out.push({ id: "unmeasured", level: "note", title: `${unmeasured.length} active objective${unmeasured.length === 1 ? " has" : "s have"} no measurable result`, detail: `Add a key result so progress can be judged by outcome: ${unmeasured.slice(0, 3).map((o) => `“${o.title}”`).join(", ")}.`, action: "open-vision" });
  const rank = { attention: 0, note: 1, good: 2 } as const;
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
