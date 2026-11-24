// Dev harness: runs the REAL assistant loop with a human-in-the-loop "model" (files in IPC_DIR). Used to let another LLM drive it.
import "fake-indexeddb/auto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { runAgent, undoRun } from "../src/domain/agentRunner";
import { runTool, type AgentData, type ToolWrites } from "../src/domain/agent";
import { defaultSettings, type Settings } from "../src/lib/model";

const DIR = process.env.IPC_DIR ?? "/tmp/ipc"; const TODAY = "2026-11-24"; let NOW = 8 * 60 + 30;
let data: AgentData = { vision: [], areas: [], objectives: [], krs: [], krPoints: [], tasks: [], occurrences: [], sessions: [], executions: [], habits: [], habitLogs: [], evidence: [], commitments: [], reviews: [], changes: [] };
let settings: Settings = defaultSettings();
const commit = async (w: ToolWrites) => { const n = { ...data } as unknown as Record<string, { id: string }[]>;
  for (const [s, rs] of Object.entries(w.put ?? {})) { const m = new Map((n[s] ?? []).map((r) => [r.id, r])); rs.forEach((r) => m.set(r.id, r)); n[s] = [...m.values()]; }
  for (const [s, ids] of Object.entries(w.del ?? {})) n[s] = (n[s] ?? []).filter((r) => !ids.includes(r.id)); data = n as unknown as AgentData; };
const context = () => ({ rules: settings.rules, today: TODAY, now: NOW, busy: (date: string) => [
  ...data.commitments.filter((c) => c.date === date).map((c) => ({ startMin: c.startMin, endMin: c.endMin, kind: "commitment" as const })),
  ...data.sessions.filter((s) => s.date === date && s.state === "approved").map((s) => ({ startMin: s.startMin, endMin: s.endMin, kind: "session" as const }))] });
const seed = async (name: string, args: Record<string, unknown>) => { const o = runTool(name, args, { data, settings, today: TODAY, context, now: Date.now() }); if ("error" in o) throw new Error(name + ": " + o.error); if (o.writes) await commit(o.writes); return o; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await seed("set_vision", { statement: "Be fit, financially calm and fluent in French", why: "Energy and freedom" });
  const fit = (await seed("create_objective", { title: "Run a 10 km race", level: "annual", areaName: "Health", target: "2027-03-01" })).result.id as string;
  await seed("create_task", { title: "Easy 5 km run", objectiveId: fit, estimateMin: 45, onDate: TODAY });
  await seed("create_commitment", { title: "Team meeting", date: TODAY, startMin: 10 * 60, endMin: 11 * 60 });
  await seed("create_commitment", { title: "Dentist", date: "2026-11-25", startMin: 14 * 60, endMin: 15 * 60 });
  const prompt = process.env.PROMPT ?? "Plan my week";
  let n = 0;
  const model = async (system: string, contents: unknown[]) => {
    n++; writeFileSync(`${DIR}/req-${n}.json`, JSON.stringify({ system: n === 1 ? system : "(same system prompt)", contents }, null, 1));
    while (!existsSync(`${DIR}/res-${n}.json`)) await sleep(300); await sleep(150);
    return { role: "model" as const, parts: JSON.parse(readFileSync(`${DIR}/res-${n}.json`, "utf8")) };
  };
  const deps = { getData: () => data, getSettings: () => settings, today: TODAY, nowMin: () => NOW, context, commit, patchSettings: async (p: Partial<Settings>) => { settings = { ...settings, ...p }; }, model };
  const before = JSON.stringify(data);
  const { reply, run } = await runAgent(prompt, [], deps);
  const report = { reply, actions: run.actions.map((a) => `${a.ok ? "OK " : "ERR"} ${a.tool}: ${a.summary}`), counts: { objectives: data.objectives.length, krs: data.krs.length, tasks: data.tasks.length, sessions: data.sessions.filter((s) => s.state === "approved").length, commitments: data.commitments.length }, rules: settings.rules.maxDailyMin };
  await undoRun(run, { commit, patchSettings: deps.patchSettings });
  (report as Record<string, unknown>).undoRestoredExactly = JSON.stringify(data) === before;
  writeFileSync(`${DIR}/report.json`, JSON.stringify(report, null, 1)); console.log("DONE");
})().catch((e) => { writeFileSync(`${DIR}/report.json`, "CRASH " + e.stack); process.exit(1); });
