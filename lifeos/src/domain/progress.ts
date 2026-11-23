// Outcome measurement. Increasing and decreasing targets are both supported; nothing is guessed.
import { diffDays, type DateStr } from "../lib/dates";
import type { KeyResult, KrPoint, Objective } from "../lib/model";

export function latestValue(kr: KeyResult, points: KrPoint[]): number {
  const mine = points.filter((p) => p.krId === kr.id).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  return mine.length ? mine[mine.length - 1]!.value : kr.baseline;
}
/** 0..1 fraction of the way from baseline to target (clamped). Returns null when baseline and target are equal (no distance to measure). */
export function krFraction(kr: KeyResult, current: number): number | null {
  if (kr.type === "binary") return current >= 1 ? 1 : 0;
  const span = kr.direction === "up" ? kr.target - kr.baseline : kr.baseline - kr.target;
  if (span <= 0) return null;   // misconfigured: target is not beyond baseline in the stated direction
  const gone = kr.direction === "up" ? current - kr.baseline : kr.baseline - current;
  return Math.max(0, Math.min(1, gone / span));
}
export const krAchieved = (kr: KeyResult, current: number) => (kr.direction === "up" ? current >= kr.target : current <= kr.target);

export interface Outcome { fraction: number | null; measured: number; total: number }
/** Objective outcome = mean of its key results; with none, the mean of its measurable children; otherwise "not measurable yet". */
export function objectiveOutcome(obj: Objective, all: Objective[], krs: KeyResult[], points: KrPoint[], depth = 0): Outcome {
  const mine = krs.filter((k) => k.objectiveId === obj.id);
  const fr = mine.map((k) => krFraction(k, latestValue(k, points))).filter((x): x is number => x !== null);
  if (fr.length) return { fraction: fr.reduce((a, b) => a + b, 0) / fr.length, measured: fr.length, total: mine.length };
  if (depth > 6) return { fraction: null, measured: 0, total: 0 };
  const kids = all.filter((o) => o.parentId === obj.id && o.status !== "cancelled" && o.status !== "archived").map((c) => objectiveOutcome(c, all, krs, points, depth + 1)).filter((o) => o.fraction !== null);
  if (kids.length) return { fraction: kids.reduce((a, b) => a + b.fraction!, 0) / kids.length, measured: kids.length, total: kids.length };
  return { fraction: null, measured: 0, total: mine.length };
}
/** Share of the objective's time window that has passed (0..1). */
export function elapsedFraction(obj: Objective, today: DateStr): number {
  const total = diffDays(obj.start, obj.target); if (total <= 0) return 1;
  return Math.max(0, Math.min(1, diffDays(obj.start, today) / total));
}
export type Pace = "not-started" | "ahead" | "on-track" | "behind" | "at-risk" | "unmeasured";
/** Compares outcome with time elapsed. Tolerance 10 points = on track; >25 points behind = at risk. Execution is NOT part of this. */
export function pace(obj: Objective, outcome: Outcome, today: DateStr): Pace {
  if (outcome.fraction === null) return "unmeasured";
  if (today < obj.start) return "not-started";
  const gap = outcome.fraction - elapsedFraction(obj, today);
  if (gap >= 0.1) return "ahead"; if (gap >= -0.1) return "on-track"; if (gap >= -0.25) return "behind"; return "at-risk";
}
export const trail = (obj: Objective | undefined, all: Objective[]): Objective[] => {
  const out: Objective[] = []; let cur = obj; let guard = 0;
  while (cur && guard++ < 8) { out.unshift(cur); cur = cur.parentId ? all.find((o) => o.id === cur!.parentId) : undefined; }
  return out;
};
