import { describe, expect, it } from "vitest";
import { analyze } from "../src/domain/coach";
import { executionStats, habitStats } from "../src/domain/evaluation";
import { proposeSchedule, type Busy, type Context, type Item } from "../src/domain/scheduler";
import { objectiveOutcome } from "../src/domain/progress";
import { addDays } from "../src/lib/dates";
import { defaultRules, type Execution, type KeyResult, type KrPoint, type Objective, type Occurrence, type Task } from "../src/lib/model";

const TODAY = "2026-11-23";
describe("performance with ~3 years of records", () => {
  const tasks: Task[] = Array.from({ length: 60 }, (_, i) => ({ id: `t${i}`, title: `T${i}`, notes: "", objectiveId: `o${i % 40}`, priority: ((i % 4) + 1) as 1 | 2 | 3 | 4, estimateMin: 30 + (i % 5) * 15, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: null, status: "active", createdAt: 0 }));
  const objectives: Objective[] = Array.from({ length: 120 }, (_, i) => ({ id: `o${i}`, title: `O${i}`, description: "", why: "", areaId: null, level: "quarterly", parentId: i >= 40 ? `o${i % 40}` : null, start: "2026-01-01", target: "2027-12-31", priority: 2, status: "active", completionCriteria: "", evidenceRequired: false, createdAt: 0, updatedAt: 0 }));
  const krs: KeyResult[] = objectives.map((o, i) => ({ id: `k${i}`, objectiveId: o.id, title: "k", type: "numeric", direction: "up", baseline: 0, target: 100, unit: "", currency: "", createdAt: 0 }));
  const points: KrPoint[] = Array.from({ length: 4000 }, (_, i) => ({ id: `p${i}`, krId: `k${i % 120}`, date: addDays("2024-01-01", i % 900), value: i % 100, note: "", createdAt: i }));
  const occurrences: Occurrence[] = Array.from({ length: 20000 }, (_, i) => ({ id: `t${i % 60}@${i}`, taskId: `t${i % 60}`, date: addDays("2024-01-01", i % 1100), status: (["done", "partial", "missed", "skipped", "planned"] as const)[i % 5]!, moves: 0, createdAt: 0 }));
  const executions: Execution[] = Array.from({ length: 15000 }, (_, i) => ({ id: `e${i}`, occId: "x", taskId: `t${i % 60}`, date: addDays("2024-01-01", i % 1100), startTs: null, endTs: null, minutes: 30, outcome: "done", pct: 100, note: "", reason: "", createdAt: 0 }));
  const time = <T,>(f: () => T) => { const t = performance.now(); const v = f(); return [performance.now() - t, v] as const; };
  it("coach analysis, execution stats and outcome roll-ups stay well under a screen refresh", () => {
    const [a] = time(() => analyze({ today: TODAY, rules: defaultRules(), objectives, krs, points, tasks, occurrences, sessions: [], executions })); expect(a).toBeLessThan(400);
    const [b] = time(() => executionStats(occurrences, tasks, executions, "2026-11-16", "2026-11-22", TODAY)); expect(b).toBeLessThan(150);
    const [c] = time(() => objectives.map((o) => objectiveOutcome(o, objectives, krs, points))); expect(c).toBeLessThan(400);
    const [d] = time(() => habitStats([{ id: "h", title: "h", objectiveId: null, days: [], createdAt: 0, archived: false }], Array.from({ length: 1000 }, (_, i) => ({ id: `${i}`, habitId: "h", date: addDays("2024-01-01", i), createdAt: 0 })), "2026-10-26", TODAY, TODAY)); expect(d).toBeLessThan(100);
  });
  it("scheduling 150 tasks across 4 weeks with a busy calendar is fast and still valid", () => {
    const ctx: Context = { rules: { ...defaultRules(), maxDailyMin: 480 }, today: TODAY, now: 480, busy: (d) => (Number(d.slice(8)) % 2 ? [{ startMin: 600, endMin: 660, kind: "external" } as Busy] : []) };
    const items: Item[] = Array.from({ length: 150 }, (_, i) => ({ occId: `o${i}`, taskId: `t${i}`, date: TODAY, estimateMin: 30 + (i % 4) * 15, priority: ((i % 4) + 1) as 1 | 2 | 3 | 4, deadline: i % 3 ? addDays(TODAY, 14 + (i % 14)) : null, earliestStart: null, preferred: "any", flexibility: "flexible" }));
    const [ms, r] = time(() => proposeSchedule(items, ctx, { from: TODAY, to: addDays(TODAY, 27) }));
    expect(ms).toBeLessThan(1500); expect(r.placements.length + r.unplaced.length).toBe(150);
  });
});
