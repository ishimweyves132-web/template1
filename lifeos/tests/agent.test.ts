import { describe, expect, it } from "vitest";
import { TOOLS, runTool, type AgentData, type ToolEnv, type ToolWrites } from "../src/domain/agent";
import { buildFullContext, runAgent, undoRun, MAX_CALLS, type RunDeps } from "../src/domain/agentRunner";
import { geminiChat, type GContent } from "../src/lib/gemini";
import { defaultSettings, type Settings } from "../src/lib/model";

const TODAY = "2026-11-24";
const emptyData = (): AgentData => ({ vision: [], areas: [], objectives: [], krs: [], krPoints: [], tasks: [], occurrences: [], sessions: [], executions: [], habits: [], habitLogs: [], evidence: [], commitments: [], reviews: [], changes: [] });

/** An in-memory app: same commit semantics as the real store (put by id, delete by id). */
function app(nowM = 8 * 60) {
  let data = emptyData(); let settings: Settings = defaultSettings();
  const commit = async (w: ToolWrites) => {
    const n = { ...data } as unknown as Record<string, { id: string }[]>;
    for (const [s, rs] of Object.entries(w.put ?? {})) { const m = new Map((n[s] ?? []).map((r) => [r.id, r])); rs.forEach((r) => m.set(r.id, r)); n[s] = [...m.values()]; }
    for (const [s, ids] of Object.entries(w.del ?? {})) n[s] = (n[s] ?? []).filter((r) => !ids.includes(r.id));
    data = n as unknown as AgentData;
  };
  const context = () => ({ rules: settings.rules, today: TODAY, now: nowM, busy: (date: string) => [
    ...data.commitments.filter((c) => c.date === date).map((c) => ({ startMin: c.startMin, endMin: c.endMin, kind: "commitment" as const })),
    ...data.sessions.filter((s) => s.date === date && s.state === "approved").map((s) => ({ startMin: s.startMin, endMin: s.endMin, kind: "session" as const })),
  ] });
  const env = (): ToolEnv => ({ data, settings, today: TODAY, context, now: 1000 });
  const deps = (model: RunDeps["model"]): RunDeps => ({ getData: () => data, getSettings: () => settings, today: TODAY, nowMin: () => nowM, context, commit, patchSettings: async (p) => { settings = { ...settings, ...p }; }, model, now: () => 1000 });
  return { get data() { return data; }, get settings() { return settings; }, commit, env, deps };
}
const call = (name: string, args: Record<string, unknown>) => ({ functionCall: { name, args } });
const script = (...turns: GContent["parts"][]) => { let i = 0; const seen: GContent[][] = []; return { model: async (_s: string, c: GContent[]): Promise<GContent> => { seen.push(structuredClone(c)); return { role: "model", parts: turns[Math.min(i++, turns.length - 1)]! }; }, seen }; };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const apply = async (a: ReturnType<typeof app>, name: string, args: Record<string, unknown>): Promise<any> => { const o = runTool(name, args, a.env()); if ("error" in o) return o; if (o.writes) await a.commit(o.writes); return o; };

describe("tool declarations", () => {
  it("are well-formed for Gemini (upper-case types, unique names, required fields exist)", () => {
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(TOOLS.length);
    const walk = (s: { type: string; properties?: Record<string, unknown>; items?: unknown; required?: string[] }) => { expect(s.type).toMatch(/^(OBJECT|STRING|NUMBER|BOOLEAN|ARRAY)$/); for (const r of s.required ?? []) expect(Object.keys(s.properties ?? {})).toContain(r); Object.values(s.properties ?? {}).forEach((p) => walk(p as never)); if (s.items) walk(s.items as never); };
    TOOLS.forEach((t) => { expect(t.description.length).toBeGreaterThan(10); walk(t.parameters); });
  });
});

describe("tools create real, valid records", () => {
  it("builds a goal tree, key results, tasks and schedules them without any approval step", async () => {
    const a = app();
    const g = await apply(a, "create_objective", { title: "Run a half marathon", level: "annual", areaName: "Health", target: "2027-05-01" }) ;
    const q = await apply(a, "create_objective", { title: "Build a 20 km base", parentId: g.result.id }) ;
    expect(q.result.level).toBe("quarterly");
    const kr = await apply(a, "create_key_result", { objectiveId: q.result.id, title: "Longest run", baseline: 5, target: 20, unit: "km" }) ;
    await apply(a, "record_measurement", { keyResultId: kr.result.id, value: 8 });
    const t = await apply(a, "create_task", { title: "Easy 5 km run", objectiveId: q.result.id, estimateMin: 40, onDate: TODAY }) ;
    expect(a.data.areas.map((x) => x.name)).toEqual(["Health"]); expect(a.data.occurrences.find((o) => o.taskId === t.result.id)?.date).toBe(TODAY);
    const s = await apply(a, "schedule_session", { taskId: t.result.id, date: TODAY, startMin: 10 * 60, endMin: 10 * 60 + 40 });
    expect("error" in s).toBe(false); expect(a.data.sessions.filter((x) => x.state === "approved")).toHaveLength(1);
    const rep = await apply(a, "schedule_session", { taskId: t.result.id, date: "2026-11-25", startMin: 9 * 60, endMin: 9 * 60 + 40 });
    expect("error" in rep).toBe(false); expect(a.data.sessions.filter((x) => x.state === "approved").map((x) => x.date)).toEqual(["2026-11-25"]);
    expect(a.data.occurrences.filter((o) => o.taskId === t.result.id && o.status === "planned").map((o) => o.date)).toEqual(["2026-11-25"]);
  });
  it("plan_period places every unscheduled planned task inside working hours", async () => {
    const a = app();
    for (const n of ["A", "B", "C"]) await apply(a, "create_task", { title: n, estimateMin: 60, onDate: TODAY });
    const r = await apply(a, "plan_period", { from: TODAY, to: TODAY }) ;
    expect(r.result.scheduled).toHaveLength(3);
    for (const s of a.data.sessions.filter((x) => x.state === "approved")) { expect(s.startMin).toBeGreaterThanOrEqual(8 * 60); expect(s.endMin).toBeLessThanOrEqual(19 * 60); }
  });
  it("completes tasks (new execution record), logs habits idempotently, stores evidence, reviews, rules", async () => {
    const a = app(); const t = await apply(a, "create_task", { title: "Write", onDate: TODAY }) ;
    await apply(a, "complete_task", { taskId: t.result.id, outcome: "partial", minutes: 20, percent: 40, reason: "interrupted" });
    expect(a.data.executions[0]).toMatchObject({ outcome: "partial", minutes: 20, pct: 40 }); expect(a.data.occurrences[0]!.status).toBe("partial");
    const h = await apply(a, "create_habit", { title: "Read", days: [0, 2, 4] }) ;
    await apply(a, "log_habit", { habitId: h.result.id }); await apply(a, "log_habit", { habitId: h.result.id }); expect(a.data.habitLogs).toHaveLength(1);
    const o = await apply(a, "create_objective", { title: "G", level: "annual" }) ;
    await apply(a, "add_evidence", { objectiveId: o.result.id, text: "https://example.com/proof" }); expect(a.data.evidence[0]!.kind).toBe("link");
    await apply(a, "save_review", { period: "weekly", wins: "x" }); await apply(a, "save_review", { period: "weekly", lessons: "y" }); expect(a.data.reviews).toHaveLength(1); expect(a.data.reviews[0]).toMatchObject({ wins: "x", lessons: "y" });
    const r = runTool("update_rules", { maxDailyMin: 300, workEndMin: 18 * 60 }, a.env()); expect("settingsPatch" in r && r.settingsPatch?.rules?.maxDailyMin).toBe(300);
  });
  it("commitments: create, edit, delete; imported events are protected", async () => {
    const a = app(); const c = await apply(a, "create_commitment", { title: "Dentist", date: TODAY, startMin: 840, endMin: 900 }) ;
    await apply(a, "update_commitment", { id: c.result.id, startMin: 870 }); expect(a.data.commitments[0]!.startMin).toBe(870);
    await apply(a, "delete_commitment", { id: c.result.id }); expect(a.data.commitments).toHaveLength(0);
    a.data.commitments.push({ id: "i", title: "ics", date: TODAY, startMin: 0, endMin: 10, source: "ics", externalId: "x", protectedBlock: false, createdAt: 0 });
    expect("error" in runTool("update_commitment", { id: "i", title: "z" }, a.env())).toBe(true);
  });
  it("archive cascades to children; cancel keeps history", async () => {
    const a = app(); const p = await apply(a, "create_objective", { title: "P", level: "annual" }) ;
    await apply(a, "create_objective", { title: "C", parentId: p.result.id });
    await apply(a, "archive_objective", { id: p.result.id }); expect(a.data.objectives.every((o) => o.status === "archived")).toBe(true);
    const t = await apply(a, "create_task", { title: "T", onDate: TODAY }) ; await apply(a, "cancel_task", { id: t.result.id });
    expect(a.data.tasks[0]!.status).toBe("cancelled"); expect(a.data.occurrences[0]!.status).toBe("cancelled");
  });
});

describe("tools reject bad input with a message the model can act on", () => {
  const a = app();
  const bad = (n: string, args: Record<string, unknown>, re: RegExp) => { const o = runTool(n, args, a.env()); expect("error" in o && o.error).toMatch(re); };
  it("covers the failure modes", () => {
    bad("create_objective", { title: "x" }, /level is required/); bad("create_objective", { title: "x", level: "annual", start: "2026-13-40" }, /real date/);
    bad("create_objective", { title: "x", level: "annual", start: "2027-01-01", target: "2026-01-01" }, /after start/); bad("create_objective", { title: "x", parentId: "nope" }, /does not exist/);
    bad("create_task", { title: "x", estimateMin: 9999 }, /estimateMin/); bad("create_task", { title: "x", objectiveId: "nope" }, /does not exist/);
    bad("schedule_session", { taskId: "nope", date: TODAY, startMin: 600, endMin: 660 }, /does not exist/); bad("nope_tool", {}, /unknown tool/);
    bad("create_commitment", { title: "x", date: TODAY, startMin: 600, endMin: 500 }, /after startMin/); bad("update_rules", { allowedDays: [] }, /at least one/);
  });
  it("refuses past times and impossible key results", async () => {
    const b = app(10 * 60); const t = await apply(b, "create_task", { title: "T", onDate: TODAY }) ;
    expect("error" in runTool("schedule_session", { taskId: t.result.id, date: TODAY, startMin: 9 * 60, endMin: 10 * 60 }, b.env())).toBe(true);
    expect("error" in runTool("schedule_session", { taskId: t.result.id, date: "2026-11-20", startMin: 9 * 60, endMin: 10 * 60 }, b.env())).toBe(true);
    const o = await apply(b, "create_objective", { title: "G", level: "annual" }) ;
    bad2(b, "create_key_result", { objectiveId: o.result.id, title: "k", baseline: 10, target: 5 }, /above the baseline/);
  });
  const bad2 = (x: ReturnType<typeof app>, n: string, args: Record<string, unknown>, re: RegExp) => { const o = runTool(n, args, x.env()); expect("error" in o && o.error).toMatch(re); };
});

describe("the assistant loop", () => {
  it("knows everything: the model receives the full data and tool results are fed back verbatim", async () => {
    const a = app(); await apply(a, "set_vision", { statement: "A calm, strong life" }); const o = await apply(a, "create_objective", { title: "Learn French", level: "annual" }) ;
    await apply(a, "create_task", { title: "Anki 20 min", objectiveId: o.result.id, onDate: TODAY });
    const s = script([call("create_task", { title: "Listen to a podcast", onDate: TODAY, estimateMin: 30 })], [{ text: "Added it." }]);
    const r = await runAgent("add a listening task", [], a.deps(s.model));
    const first = s.seen[0]!; const text = first[first.length - 1]!.parts[0]!.text!;
    expect(text).toContain("A calm, strong life"); expect(text).toContain("Learn French"); expect(text).toContain("Anki 20 min");
    const second = s.seen[1]!; expect(second[second.length - 2]!.parts[0]).toMatchObject({ functionCall: { name: "create_task" } }); expect(second[second.length - 1]!.parts[0]).toMatchObject({ functionResponse: { name: "create_task", response: { ok: true } } });
    expect(r.reply).toBe("Added it."); expect(a.data.tasks.map((t) => t.title)).toContain("Listen to a podcast"); expect(r.run.actions[0]).toMatchObject({ ok: true });
  });
  it("a failing call is reported to the model, which corrects itself", async () => {
    const a = app(); const s = script([call("create_objective", { title: "G" })], [call("create_objective", { title: "G", level: "annual" })], [{ text: "Fixed." }]);
    const r = await runAgent("make a goal", [], a.deps(s.model));
    expect(r.run.actions.map((x) => x.ok)).toEqual([false, true]); expect(s.seen[1]!.at(-1)!.parts[0]!.functionResponse!.response).toHaveProperty("error"); expect(a.data.objectives).toHaveLength(1);
  });
  it("undo restores every record exactly: new ones removed, edited ones put back, rules reverted", async () => {
    const a = app(); const o = await apply(a, "create_objective", { title: "Original", level: "annual" }) ;
    const before = structuredClone(a.data); const rulesBefore = structuredClone(a.settings.rules);
    const s = script([call("update_objective", { id: o.result.id, title: "Renamed" }), call("create_task", { title: "N", onDate: TODAY }), call("update_rules", { maxDailyMin: 120 }), call("create_commitment", { title: "M", date: TODAY, startMin: 600, endMin: 660 })], [{ text: "ok" }]);
    const r = await runAgent("do things", [], a.deps(s.model));
    expect(a.data.objectives[0]!.title).toBe("Renamed"); expect(a.settings.rules.maxDailyMin).toBe(120);
    await undoRun(r.run, a.deps(s.model)); expect(a.data).toEqual(before); expect(a.settings.rules).toEqual(rulesBefore);
  });
  it("undo also restores deleted records", async () => {
    const a = app(); const c = await apply(a, "create_commitment", { title: "Keep", date: TODAY, startMin: 600, endMin: 660 }) ;
    const before = structuredClone(a.data); const r = await runAgent("remove it", [], a.deps(script([call("delete_commitment", { id: c.result.id })], [{ text: "gone" }]).model));
    expect(a.data.commitments).toHaveLength(0); await undoRun(r.run, a.deps(script([{ text: "" }]).model)); expect(a.data).toEqual(before);
  });
  it("bounds a runaway model: at most MAX_CALLS actions and a finite number of rounds", async () => {
    const a = app(); let n = 0; const model = async (): Promise<GContent> => { n++; return { role: "model", parts: Array.from({ length: 10 }, () => call("create_task", { title: "spam", onDate: TODAY })) }; };
    const r = await runAgent("go", [], a.deps(model)); expect(a.data.tasks.length).toBeLessThanOrEqual(MAX_CALLS); expect(n).toBeLessThanOrEqual(8); expect(r.reply.length).toBeGreaterThan(0);
  });
  it("context stays bounded and complete for a big account", () => {
    const a = app(); for (let i = 0; i < 300; i++) a.data.tasks.push({ id: `t${i}`, title: `Task ${i}`, notes: "", objectiveId: null, priority: 2, estimateMin: 30, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: TODAY, status: "active", createdAt: 0 });
    const txt = buildFullContext(a.data, a.settings, TODAY, 480); expect(txt).toContain("Task 299"); expect(txt.length).toBeLessThan(120_000); expect(JSON.parse(txt).today).toBe(TODAY);
  });
});

describe("geminiChat (function calling over REST, mocked)", () => {
  const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
  it("sends tools + key header only, returns model content untouched (signatures preserved)", async () => {
    let req: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => { req = { url, init }; return new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "create_task", args: { title: "x" } }, thoughtSignature: "SIG" }] } }] })); }) as unknown as typeof fetch;
    const out = await geminiChat({ key: "K".repeat(30), model: "gemini-2.5-flash", system: "s", contents: [{ role: "user", parts: [{ text: "hi" }] }], tools: TOOLS, fetchImpl: f });
    expect(out.parts[0]).toMatchObject({ thoughtSignature: "SIG" }); expect(req!.url).not.toContain("KKKK"); expect((req!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe("K".repeat(30));
    const sent = JSON.parse(req!.init.body as string); expect(sent.tools[0].functionDeclarations).toHaveLength(TOOLS.length); expect(sent.systemInstruction.parts[0].text).toBe("s");
  });
  it("errors are readable and never contain the key", async () => {
    const key = "SECRETKEY".repeat(4); const f = (async () => new Response(JSON.stringify({ error: { message: `bad ${key}` } }), { status: 500 })) as unknown as typeof fetch;
    await expect(geminiChat({ key, model: "gemini-x", system: "", contents: [], tools: [], fetchImpl: f })).rejects.toThrow(/HTTP 500/);
    await geminiChat({ key, model: "gemini-x", system: "", contents: [], tools: [], fetchImpl: f }).catch((e: Error) => expect(e.message).not.toContain(key));
    await expect(geminiChat({ key, model: "gemini-x", system: "", contents: [], tools: [], fetchImpl: ok({ candidates: [] }) })).rejects.toThrow(/no answer/);
    await expect(geminiChat({ key, model: "bad model!", system: "", contents: [], tools: [] })).rejects.toThrow(/Choose a model/);
  });
});

describe("model failures mid-run", () => {
  it("keeps (and can undo) what was done before a failure and tells the user", async () => {
    const a = app(); let n = 0; const model = async (): Promise<GContent> => { if (n++ === 0) return { role: "model", parts: [call("create_task", { title: "A", onDate: TODAY })] }; throw new Error("Gemini's rate limit or free quota was reached."); };
    const r = await runAgent("x", [], a.deps(model)); expect(r.reply).toMatch(/rate limit/); expect(r.reply).toMatch(/can be undone/); expect(a.data.tasks).toHaveLength(1);
    await undoRun(r.run, a.deps(model)); expect(a.data.tasks).toHaveLength(0);
  });
});

describe("regression found by the live LLM run", () => {
  it("cancelling a scheduled task also frees its calendar slot, and the assistant no longer sees it", async () => {
    const a = app(); const t = await apply(a, "create_task", { title: "Run", onDate: TODAY, estimateMin: 45 });
    await apply(a, "schedule_session", { taskId: t.result.id, date: TODAY, startMin: 11 * 60, endMin: 11 * 60 + 45 });
    expect(a.data.sessions.filter((s) => s.state === "approved")).toHaveLength(1);
    await apply(a, "cancel_task", { id: t.result.id });
    expect(a.data.sessions.filter((s) => s.state === "approved")).toHaveLength(0);
    expect(JSON.parse(buildFullContext(a.data, a.settings, TODAY, 480)).calendar).toHaveLength(0);
  });
  it("a stale approved session of a cancelled occurrence never shows up in the model's calendar", () => {
    const a = app(); a.data.occurrences.push({ id: "o", taskId: "t", date: TODAY, status: "cancelled", moves: 0, createdAt: 0 }); a.data.sessions.push({ id: "s", occId: "o", date: TODAY, startMin: 600, endMin: 660, state: "approved", reason: "", createdAt: 0 });
    expect(JSON.parse(buildFullContext(a.data, a.settings, TODAY, 480)).calendar).toHaveLength(0);
  });
});

import { migrateLevel, LONG_TERM_DAYS } from "../src/lib/model";
describe("any time horizon (not fixed at four years)", () => {
  it("old four-year records migrate to long-term; unknown levels become long-term", () => {
    expect(migrateLevel("four-year")).toBe("long-term"); expect(migrateLevel("ten-year")).toBe("long-term"); expect(migrateLevel("lifetime")).toBe("long-term");
    expect(migrateLevel("annual")).toBe("annual"); expect(migrateLevel("nonsense")).toBe("long-term");
  });
  it("a long-term goal defaults to ten years, and an explicit target can be 20 years or 5 years", async () => {
    const a = app();
    const ten = await apply(a, "create_objective", { title: "Speak French at B2", level: "long-term", start: TODAY });
    expect(a.data.objectives[0]!.level).toBe("long-term"); expect(diffDaysSafe(TODAY, a.data.objectives[0]!.target)).toBeGreaterThanOrEqual(LONG_TERM_DAYS - 2);
    expect("error" in ten).toBe(false);
    const twenty = await apply(a, "create_objective", { title: "Build a company", level: "long-term", start: TODAY, target: "2046-11-24" });
    expect(a.data.objectives.find((o) => o.id === twenty.result.id)!.target).toBe("2046-11-24");
    const five = await apply(a, "create_objective", { title: "Run a marathon", level: "long-term", start: TODAY, target: "2031-11-24" });
    expect(five.result.target).toBe("2031-11-24");
  });
  it("legacy level names from older tool calls are accepted and stored as long-term", async () => {
    const a = app(); const r = await apply(a, "create_objective", { title: "Old habit of thinking", level: "four-year" });
    expect("error" in r).toBe(false); expect(a.data.objectives[0]!.level).toBe("long-term");
  });
  it("the vision can look up to 50 years ahead, not just 10", () => {
    const a = app(); expect("error" in runTool("set_vision", { statement: "Long life", horizonYears: 30 }, a.env())).toBe(false);
    expect("error" in runTool("set_vision", { statement: "Long life", horizonYears: 60 }, a.env())).toBe(true);
  });
});
const diffDaysSafe = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;

describe("the assistant can undo its own mistakes", () => {
  it("removes a wrong key result (with its values), and stops a habit without losing its history", async () => {
    const a = app(); const o = await apply(a, "create_objective", { title: "Goal", level: "annual" });
    const k = await apply(a, "create_key_result", { objectiveId: o.result.id, title: "Placeholder", baseline: 0, target: 1 });
    await apply(a, "record_measurement", { keyResultId: k.result.id, value: 1 });
    const del = await apply(a, "delete_key_result", { id: k.result.id }); expect("error" in del).toBe(false);
    expect(a.data.krs).toHaveLength(0); expect(a.data.krPoints).toHaveLength(0);
    const h = await apply(a, "create_habit", { title: "Read" }); await apply(a, "log_habit", { habitId: h.result.id });
    await apply(a, "archive_habit", { habitId: h.result.id }); expect(a.data.habits[0]!.archived).toBe(true); expect(a.data.habitLogs).toHaveLength(1);
  });
  it("both deletions can be undone exactly", async () => {
    const a = app(); const o = await apply(a, "create_objective", { title: "Goal", level: "annual" });
    const k = await apply(a, "create_key_result", { objectiveId: o.result.id, title: "Keep me", baseline: 0, target: 1 });
    const before = structuredClone(a.data);
    const r = await runAgent("remove it", [], a.deps(script([call("delete_key_result", { id: k.result.id })], [{ text: "removed" }]).model));
    expect(a.data.krs).toHaveLength(0); await undoRun(r.run, a.deps(script([{ text: "" }]).model)); expect(a.data).toEqual(before);
  });
});
