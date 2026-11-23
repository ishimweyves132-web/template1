import { describe, expect, it } from "vitest";
import { evidenceGaps, executionStats, habitDueToday, habitStats, weightedSummary } from "../src/domain/evaluation";
import { analyze } from "../src/domain/coach";
import { buildAiRequest, callGateway, validateAi, type GuardContext } from "../src/domain/aiGuard";
import { defaultRules, type KrPoint, type Evidence, type Execution, type Habit, type HabitLog, type KeyResult, type Objective, type Occurrence, type Session, type Task } from "../src/lib/model";
import type { Busy, Context } from "../src/domain/scheduler";

const TODAY = "2026-11-23";
const task = (p: Partial<Task> = {}): Task => ({ id: "t1", title: "French", notes: "", objectiveId: "o1", priority: 2, estimateMin: 60, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: null, status: "active", createdAt: 0, ...p });
const occ = (id: string, date: string, status: Occurrence["status"], taskId = "t1"): Occurrence => ({ id, taskId, date, status, moves: 0, createdAt: 0 });
const exec = (p: Partial<Execution>): Execution => ({ id: Math.random().toString(), occId: "x", taskId: "t1", date: TODAY, startTs: null, endTs: null, minutes: 30, outcome: "done", pct: null, note: "", reason: "", createdAt: 0, ...p });
const obj = (p: Partial<Objective> = {}): Objective => ({ id: "o1", title: "B2 French", description: "", why: "", areaId: null, level: "annual", parentId: null, start: "2026-01-01", target: "2026-12-31", priority: 2, status: "active", completionCriteria: "", evidenceRequired: false, createdAt: 0, updatedAt: 0, ...p });

describe("evaluation keeps execution and outcome apart", () => {
  it("counts done / partial / skipped / missed and separates planned from actual time", () => {
    const occs = [occ("a", "2026-11-23", "done"), occ("b", "2026-11-22", "partial"), occ("c", "2026-11-21", "missed"), occ("d", "2026-11-20", "planned"), occ("e", "2026-11-19", "skipped"), occ("f", "2026-11-24", "planned"), occ("g", "2026-11-18", "cancelled")];
    const s = executionStats(occs, [task()], [exec({ minutes: 45, date: "2026-11-23" }), exec({ minutes: 20, date: "2026-11-22" })], "2026-11-17", "2026-11-30", TODAY);
    expect(s).toMatchObject({ done: 1, partial: 1, skipped: 1, missed: 2, open: 1, resolved: 5 });   // a planned task in the past counts as missed
    expect(s.doneRate).toBeCloseTo(0.2); expect(s.plannedMin).toBe(300); expect(s.actualMin).toBe(65);
  });
  it("no resolved tasks gives null, never a made-up 0% or 100%", () => expect(executionStats([], [], [], "2026-11-01", "2026-11-30", TODAY).doneRate).toBeNull());
  it("habit streaks count due days only and do not break on a not-yet-logged today", () => {
    const h: Habit = { id: "h", title: "Read", objectiveId: null, days: [], createdAt: 0, archived: false };
    const logs: HabitLog[] = ["2026-11-20", "2026-11-21", "2026-11-22"].map((d) => ({ id: d, habitId: "h", date: d, createdAt: 0 }));
    const s = habitStats([h], logs, "2026-11-17", TODAY, TODAY)[0]!;
    expect(s).toMatchObject({ due: 7, done: 3, streak: 3 });
    const weekdayOnly: Habit = { ...h, days: [0, 1, 2, 3, 4] };    // Mon-Fri: the weekend is not "due"
    expect(habitStats([weekdayOnly], [{ id: "x", habitId: "h", date: "2026-11-20", createdAt: 0 }, { id: "y", habitId: "h", date: "2026-11-23", createdAt: 0 }], "2026-11-19", TODAY, TODAY)[0]!.streak).toBe(2);
    expect(habitDueToday(weekdayOnly, "2026-11-22")).toBe(false);
  });
  it("evidence gaps list only objectives that require evidence and have none", () => {
    const os = [obj({ id: "a", evidenceRequired: true }), obj({ id: "b", evidenceRequired: true }), obj({ id: "c" })];
    const ev: Evidence[] = [{ id: "e", objectiveId: "a", krId: null, occId: null, kind: "note", text: "certificate", createdAt: 0 }];
    expect(evidenceGaps(os, ev).map((g) => g.objective.id)).toEqual(["b"]);
  });
  it("weighted summary is transparent and ignores unmeasured parts", () => {
    const r = weightedSummary([{ name: "exec", value: 0.8, weight: 1 }, { name: "outcome", value: 0.4, weight: 3 }, { name: "evidence", value: null, weight: 2 }]);
    expect(r.value).toBeCloseTo(0.5); expect(r.parts.map((p) => p.name)).toEqual(["exec", "outcome"]); expect(weightedSummary([{ name: "x", value: null, weight: 1 }]).value).toBeNull();
  });
});

const base = () => ({ today: TODAY, rules: defaultRules(), objectives: [obj()], krs: [] as KeyResult[], points: [] as KrPoint[], tasks: [task()], occurrences: [] as Occurrence[], sessions: [] as Session[], executions: [] as Execution[] });
describe("coach", () => {
  it("flags overload against the user's own capacity, missed work, unscheduled work and neglected objectives", () => {
    const i = base(); i.rules.maxDailyMin = 120;
    i.occurrences = [occ("a", TODAY, "planned"), occ("b", TODAY, "planned"), occ("c", TODAY, "planned"), occ("m", "2026-11-20", "missed")];
    const ids = analyze(i).map((x) => x.id);
    expect(ids).toContain(`overload-${TODAY}`); expect(ids).toContain("missed"); expect(ids).toContain("unscheduled"); expect(ids).toContain("neglected-o1"); expect(ids).toContain("unmeasured");
  });
  it("says nothing alarming for a calm, healthy plan, and praises being ahead on outcome", () => {
    const i = base(); i.objectives = [obj({ start: "2026-11-01", target: "2026-12-31" })];
    i.krs = [{ id: "k", objectiveId: "o1", title: "k", type: "numeric", direction: "up", baseline: 0, target: 10, unit: "", currency: "", createdAt: 0 }]; i.points = [{ id: "p", krId: "k", date: "2026-11-20", value: 8, note: "", createdAt: 0 }];
    i.executions = [exec({ date: "2026-11-22" })]; i.occurrences = [occ("a", TODAY, "planned")]; i.sessions = [{ id: "s", occId: "a", date: TODAY, startMin: 600, endMin: 660, state: "approved", reason: "", createdAt: 0 }];
    const r = analyze(i); expect(r.filter((x) => x.level === "attention")).toEqual([]); expect(r.some((x) => x.id === "ahead")).toBe(true);
  });
  it("outcome 'behind' is reported separately from execution (high execution, low outcome)", () => {
    const i = base(); i.objectives = [obj({ start: "2026-01-01", target: "2026-12-31" })];
    i.krs = [{ id: "k", objectiveId: "o1", title: "k", type: "numeric", direction: "up", baseline: 0, target: 100, unit: "", currency: "", createdAt: 0 }]; i.points = [{ id: "p", krId: "k", date: "2026-11-01", value: 10, note: "", createdAt: 0 }];
    i.executions = [exec({ date: TODAY })];   // lots of recent work
    const r = analyze(i).find((x) => x.id === "pace-o1")!; expect(r.title).toMatch(/at risk/); expect(r.detail).toMatch(/not the same as getting the result/);
  });
});

const ctx = (busy: Record<string, Busy[]> = {}): Context => ({ rules: defaultRules(), today: TODAY, now: 7 * 60, busy: (d) => busy[d] ?? [] });
const g = (over: Partial<GuardContext> = {}): GuardContext => ({ ctx: ctx(), tasks: [task({ id: "t1", deadline: "2026-11-27" }), task({ id: "t2", title: "Gym" })], objectives: [obj()], occurrences: [{ id: "t1@a", taskId: "t1", status: "planned" }, { id: "t2@a", taskId: "t2", status: "planned" }, { id: "t1@done", taskId: "t1", status: "done" }], ...over });
describe("AI guard: AI may suggest, never decide", () => {
  const sched = (p: Record<string, unknown> = {}) => ({ op: "propose_schedule", taskId: "t1", occId: "t1@a", date: "2026-11-24", startMin: 600, endMin: 660, why: "morning", ...p });
  it("accepts well-formed, rule-abiding proposals", () => {
    const v = validateAi({ operations: [sched(), { op: "propose_task", title: "Book exam", estimateMin: 30, objectiveId: "o1", priority: 1, onDate: "2026-11-25", why: "needed" }, { op: "advice", text: "Protect your mornings." }] }, g());
    expect(v.rejected).toEqual([]); expect(v.accepted.map((a) => a.op)).toEqual(["propose_schedule", "propose_task", "advice"]);
  });
  it("rejects every forbidden power by name", () => {
    for (const op of ["update_objective", "delete_objective", "change_target", "change_deadline", "change_vision", "mark_completed", "move_external_event", "delete_event", "change_rules", "change_permissions", "update_key_result"]) {
      const v = validateAi({ operations: [{ op, id: "o1", value: 1 }] }, g()); expect(v.accepted).toEqual([]); expect(v.rejected[0]!.reasons[0]).toMatch(/not permitted/);
    }
  });
  it("rejects schedule proposals that break any rule (validated by the deterministic engine, not trusted)", () => {
    const bad = [sched({ date: "2026-11-28" }), sched({ date: "2026-11-29" }), sched({ startMin: 120, endMin: 180 }), sched({ date: "2026-11-20" }), sched({ endMin: 620 }), sched({ occId: "t1@done" }), sched({ taskId: "nope" }), sched({ occId: "t2@a" }), sched({ startMin: "10" })];
    const v = validateAi({ operations: bad }, g()); expect(v.accepted).toEqual([]); expect(v.rejected).toHaveLength(bad.length);
    expect(v.rejected.map((r) => r.reasons.join(" ")).join(" | ")).toMatch(/after the deadline.*not an allowed working day|rule violation/);
  });
  it("blocks overlaps with calendar events, and overlaps between the AI's own proposals; duplicates are dropped", () => {
    const c = g({ ctx: ctx({ "2026-11-24": [{ startMin: 600, endMin: 660, kind: "external" }] }) });
    expect(validateAi({ operations: [sched()] }, c).rejected[0]!.reasons[0]).toMatch(/overlaps a calendar event/);
    const v = validateAi({ operations: [sched({ startMin: 700, endMin: 760 }), sched({ taskId: "t2", occId: "t2@a", startMin: 720, endMin: 780 }), sched({ startMin: 700, endMin: 760 })] }, g());
    expect(v.accepted).toHaveLength(1); expect(v.rejected.map((r) => r.reasons[0])).toEqual([expect.stringMatching(/overlaps another scheduled task/), "duplicate proposal"]);
  });
  it("validates tasks: unknown objective, absurd estimate, long titles, bad dates", () => {
    const ops = [{ op: "propose_task", title: "x", estimateMin: 9999 }, { op: "propose_task", title: "x", estimateMin: 30, objectiveId: "ghost" }, { op: "propose_task", title: "a".repeat(500), estimateMin: 30 }, { op: "propose_task", title: "ok", estimateMin: 30, onDate: "2026-13-45" }];
    const v = validateAi({ operations: ops }, g()); expect(v.accepted).toEqual([]); expect(v.rejected).toHaveLength(4);
  });
  it("garbage in, nothing out: invalid JSON shapes, unknown ops, huge lists, missing fields", () => {
    for (const raw of [null, "text", 42, [], {}, { operations: "x" }, { operations: [null, 1, "a", {}, { op: 5 }, { op: "format_disk" }] }]) { const v = validateAi(raw, g()); expect(v.accepted).toEqual([]); }
    expect(validateAi({ operations: Array.from({ length: 500 }, (_, i) => ({ op: "advice", text: `tip ${i}` })) }, g()).accepted).toHaveLength(50);   // capped
    expect(validateAi({ operations: [{ op: "advice", text: "x".repeat(601) }] }, g()).accepted).toEqual([]);
  });
  it("strips unknown fields so extra instructions cannot ride along", () => {
    const v = validateAi({ operations: [{ ...sched(), deleteGoals: true, newPermissions: ["all"] }] }, g());
    expect(Object.keys(v.accepted[0]!).sort()).toEqual(["date", "endMin", "occId", "op", "startMin", "taskId", "why"]);
  });
  it("the request sent to a model contains no notes, evidence or calendar event titles", () => {
    const r = buildAiRequest({ today: TODAY, tasks: [{ id: "t1", title: "French", estimateMin: 60, priority: 2, deadline: null }], free: { [TODAY]: [{ start: 480, end: 600 }] }, rules: { maxDailyMin: 360 } });
    const s = JSON.stringify(r); expect(s).not.toMatch(/notes|evidence|description|attendee/i); expect(r.allowedOperations).toEqual(["propose_schedule", "propose_task", "advice"]);
  });
  it("gateway: https only (localhost allowed), failures are explicit, timeouts abort", async () => {
    await expect(callGateway("http://example.com/x", {})).rejects.toThrow(/https/);
    const ok = (async () => new Response(JSON.stringify({ operations: [] }), { status: 200 })) as unknown as typeof fetch;
    expect(await callGateway("https://gw.example/plan", {}, ok)).toEqual({ operations: [] });
    await expect(callGateway("https://gw.example/plan", {}, (async () => new Response("no", { status: 503 })) as unknown as typeof fetch)).rejects.toThrow(/HTTP 503/);
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    await expect(callGateway("https://gw.example/plan", {}, hang, 20)).rejects.toThrow(/did not answer in time/);
  });
});
