// The autonomous assistant loop. The model sees ALL of the user's data and acts through the tools in agent.ts.
// Every write is captured with the record's previous version, so a whole run can be reverted exactly.
import { addDays, diffDays, minToHM, type DateStr } from "../lib/dates";
import type { AiAction, AiRun, ChatMsg, Rules, Settings, UndoEntry } from "../lib/model";
import { uid } from "../lib/model";
import type { GContent, GPart } from "../lib/gemini";
import { latestValue, krFraction } from "./progress";
import { TOOLS, runTool, type AgentData, type ToolWrites } from "./agent";
import type { Context } from "./scheduler";

export const MAX_ROUNDS = 8; export const MAX_CALLS = 40;

export const SYSTEM_PROMPT = `You are the personal execution assistant inside LifeOS, a private life-planning app. You are not a suggestion engine: you DO the work.
You are given the user's COMPLETE current data as JSON (goals and their key results, tasks, calendar, scheduled sessions, habits, history, rules). Treat it as the single source of truth and refer to items by their "id".
Rules of engagement:
- When the user asks for something, carry it out with the tools. Do not ask permission and do not just describe what you would do. Ask a question only when a required detail is truly missing and cannot be reasonably assumed.
- Create the whole structure when asked to plan something: objective(s) with the right parent, measurable key results, concrete tasks (with estimates and dates), then schedule them with plan_period or schedule_session.
- Prefer ids from the data. Never invent ids. Dates are YYYY-MM-DD; times are minutes after midnight. "today" and "nowMin" are in the data; never schedule in the past.
- If a tool returns an error, read it, correct the arguments and try again. If a tool result has a "warning", mention it to the user.
- Never delete the user's history: use cancel/archive tools. Everything you do can be undone by the user with one tap, so act confidently, but keep changes proportional to the request.
- Be honest: report exactly what you changed and anything you could not do. If the data shows the user is overloaded or behind, say so plainly and propose a realistic adjustment.
- Reply in the user's language, briefly: a short summary of what you did and what they should look at next. No markdown tables.`;

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
/** Everything the assistant needs to know, as compact JSON text. Windows keep it bounded while covering far more than a human sees at once. */
export function buildFullContext(d: AgentData, settings: Settings, today: DateStr, nowM: number): string {
  const back = addDays(today, -60), fwd = addDays(today, 45); const inWin = (x: DateStr) => x >= back && x <= fwd;
  const objs = d.objectives.filter((o) => o.status !== "archived").map((o) => { const krs = d.krs.filter((k) => k.objectiveId === o.id).map((k) => { const pts = d.krPoints.filter((p) => p.krId === k.id); const v = latestValue(k, pts); return { id: k.id, title: k.title, type: k.type, dir: k.direction, baseline: k.baseline, target: k.target, unit: k.unit, current: v, pct: Math.round((krFraction(k, v) ?? 0) * 100) }; });
    return { id: o.id, title: o.title, level: o.level, parentId: o.parentId, area: d.areas.find((a) => a.id === o.areaId)?.name ?? null, start: o.start, target: o.target, priority: o.priority, status: o.status, why: cut(o.why, 160), done_when: cut(o.completionCriteria, 160), keyResults: krs }; });
  const occ = d.occurrences.filter((o) => inWin(o.date) && o.status !== "cancelled"); const sess = d.sessions.filter((s) => s.state === "approved" && inWin(s.date)); const taskById = new Map(d.tasks.map((t) => [t.id, t]));
  const tasks = d.tasks.filter((t) => t.status === "active").map((t) => ({ id: t.id, title: t.title, objectiveId: t.objectiveId, estimateMin: t.estimateMin, priority: t.priority, deadline: t.deadline, onDate: t.onDate, repeats: t.recurrence && t.recurrence.kind !== "none" ? { kind: t.recurrence.kind, days: t.recurrence.days, until: t.recurrence.until } : null, preferred: t.preferred, protected: t.protectedTask, notes: cut(t.notes, 120) }));
  const calendar = [...sess.map((s) => { const o = d.occurrences.find((x) => x.id === s.occId); const t = o && taskById.get(o.taskId); return { kind: "task", taskId: t?.id, title: t?.title, date: s.date, start: minToHM(s.startMin), end: minToHM(s.endMin), status: o?.status }; }),
    ...d.commitments.filter((c) => inWin(c.date)).map((c) => ({ kind: c.source === "ics" ? "imported-event" : "commitment", id: c.id, title: c.title, date: c.date, start: minToHM(c.startMin), end: minToHM(c.endMin), protected: c.protectedBlock }))].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
  const unscheduled = occ.filter((o) => (o.status === "planned" || o.status === "in-progress") && !sess.some((s) => s.occId === o.id)).map((o) => ({ taskId: o.taskId, title: taskById.get(o.taskId)?.title, date: o.date }));
  const hist = d.executions.filter((e) => e.date >= back).map((e) => ({ task: taskById.get(e.taskId)?.title, date: e.date, outcome: e.outcome, minutes: e.minutes, reason: e.reason || undefined }));
  const missed = occ.filter((o) => o.status === "missed").map((o) => ({ taskId: o.taskId, title: taskById.get(o.taskId)?.title, date: o.date }));
  const habits = d.habits.filter((h) => !h.archived).map((h) => { const logs = d.habitLogs.filter((l) => l.habitId === h.id && l.date >= back).map((l) => l.date).sort(); return { id: h.id, title: h.title, days: h.days, objectiveId: h.objectiveId, doneDates: logs, doneToday: logs.includes(today) }; });
  const ev = [...d.evidence].sort((a, b) => b.createdAt - a.createdAt).slice(0, 40).map((e) => ({ objectiveId: e.objectiveId, kind: e.kind, text: cut(e.text, 200) }));
  const reviews = [...d.reviews].sort((a, b) => b.periodStart.localeCompare(a.periodStart)).slice(0, 6).map((r) => ({ period: r.period, start: r.periodStart, wins: cut(r.wins, 200), misses: cut(r.misses, 200), lessons: cut(r.lessons, 200), adjustments: cut(r.adjustments, 200) }));
  const r: Rules = settings.rules; const v = d.vision[0];
  return JSON.stringify({ today, weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(new Date(today + "T00:00:00").getDay() + 6) % 7], nowMin: nowM, nowTime: minToHM(nowM),
    vision: v ? { statement: v.statement, why: v.why, years: v.horizonYears } : null, rules: { workHours: `${minToHM(r.workStart)}-${minToHM(r.workEnd)}`, workStartMin: r.workStart, workEndMin: r.workEnd, allowedDays: r.allowedDays, maxDailyMin: r.maxDailyMin, bufferMin: r.bufferMin, autoReschedule: r.autoReschedule },
    objectives: objs, tasks, calendar, unscheduledPlanned: unscheduled, missed, recentHistory: hist, habits, evidence: ev, reviews, counts: { objectives: objs.length, tasks: tasks.length, windowDays: `${diffDays(back, today)} back / ${diffDays(today, fwd)} ahead` } });
}

export interface RunDeps {
  getData: () => AgentData; getSettings: () => Settings; today: DateStr; nowMin: () => number; context: () => Context;
  commit: (w: ToolWrites) => Promise<void>; patchSettings: (p: Partial<Settings>) => Promise<void>;
  model: (system: string, contents: GContent[]) => Promise<GContent>; now?: () => number;
}
const rec = (d: AgentData, store: string, id: string): unknown | null => ((d as unknown as Record<string, { id: string }[]>)[store] ?? []).find((r) => r.id === id) ?? null;

/** Run one user request to completion. Always resolves with what happened; tool-level failures are reported to the model, not thrown. */
export async function runAgent(prompt: string, history: ChatMsg[], deps: RunDeps): Promise<{ reply: string; run: AiRun }> {
  const now = deps.now ?? Date.now; const run: AiRun = { id: uid(), at: now(), prompt, actions: [], undo: [], undone: false }; const seen = new Set<string>();
  const remember = (store: string, id: string, prev: unknown | null) => { const k = `${store}/${id}`; if (!seen.has(k)) { seen.add(k); run.undo.push({ store, id, prev }); } };
  const contents: GContent[] = [];
  for (const m of history.slice(-12)) contents.push({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.text }] });
  const ctxText = buildFullContext(deps.getData(), deps.getSettings(), deps.today, deps.nowMin());
  contents.push({ role: "user", parts: [{ text: `CURRENT DATA (JSON):\n${ctxText}\n\nREQUEST:\n${prompt}` }] });
  const decls = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));
  let calls = 0; let reply = "";
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let out: GContent; try { out = await deps.model(SYSTEM_PROMPT, contents); } catch (e) { reply = `⚠ ${(e as Error).message}${run.actions.some((a) => a.ok) ? " Changes made before this are listed below and can be undone." : " Nothing was changed."}`; break; }
    contents.push(out);
    const fcs = out.parts.filter((p) => p.functionCall); const text = out.parts.map((p) => p.text ?? "").join("").trim();
    if (!fcs.length) { reply = text; break; }
    const responses: GPart[] = [];
    for (const p of fcs) {
      const { name, args } = p.functionCall!; let response: Record<string, unknown>; let action: AiAction;
      if (++calls > MAX_CALLS) { response = { error: "too many actions in one request; stop and summarise" }; action = { tool: name, args, ok: false, summary: "Skipped: action limit reached" }; }
      else {
        let o: ReturnType<typeof runTool>;
        try { o = runTool(name, (args ?? {}) as Record<string, unknown>, { data: deps.getData(), settings: deps.getSettings(), today: deps.today, context: deps.context, now: now() }); } catch (e) { o = { error: `tool failed: ${(e as Error).message}` }; }
        if ("error" in o) { response = { error: o.error }; action = { tool: name, args, ok: false, summary: o.error }; }
        else {
          try {
            const d = deps.getData(); const snap: UndoEntry[] = [];
            for (const [s, rs] of Object.entries(o.writes?.put ?? {})) for (const r of rs) snap.push({ store: s, id: r.id, prev: rec(d, s, r.id) });
            for (const [s, ids] of Object.entries(o.writes?.del ?? {})) for (const id of ids) snap.push({ store: s, id, prev: rec(d, s, id) });
            if (o.settingsPatch?.rules) snap.push({ store: "settings", id: "rules", prev: deps.getSettings().rules });
            if (o.writes) await deps.commit(o.writes); if (o.settingsPatch) await deps.patchSettings(o.settingsPatch);
            for (const e of snap) remember(e.store, e.id, e.prev);
            response = o.result; action = { tool: name, args, ok: true, summary: o.summary };
          } catch (e) { response = { error: `could not save: ${(e as Error).message}` }; action = { tool: name, args, ok: false, summary: "Could not save" }; }
        }
      }
      run.actions.push(action); responses.push({ functionResponse: { name, response } });
    }
    contents.push({ role: "user", parts: responses });
    if (round === MAX_ROUNDS - 1) reply = text || "I reached the step limit for one request. What I did so far is listed below; ask me to continue.";
  }
  if (!reply) reply = run.actions.length ? `Done: ${run.actions.filter((a) => a.ok).length} change(s) made.` : "I have nothing to change for that.";
  return { reply, run };
}

/** Put every record the run touched back exactly as it was. Records the user edited afterwards are reverted too. */
export async function undoRun(run: AiRun, deps: Pick<RunDeps, "commit" | "patchSettings">): Promise<void> {
  const w: ToolWrites = { put: {}, del: {} };
  for (const u of [...run.undo].reverse()) {
    if (u.store === "settings") { await deps.patchSettings({ rules: u.prev as Rules }); continue; }
    if (u.prev === null) (w.del![u.store] ??= []).push(u.id); else (w.put![u.store] ??= []).push(u.prev as { id: string });
  }
  await deps.commit(w);
}
export const runSummary = (r: AiRun) => { const ok = r.actions.filter((a) => a.ok).length; return `${ok} change${ok === 1 ? "" : "s"}${r.actions.length > ok ? `, ${r.actions.length - ok} failed` : ""}`; };

