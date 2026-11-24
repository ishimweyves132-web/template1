// The assistant's hands. Each tool validates its arguments, then returns the records to write (or an error the model can read and fix).
// There is no approval step: the owner chose an autonomous assistant. Safety comes from exact record-level undo (see agentRunner), not from refusing.
import { addDays, diffDays, isDateStr, minToHM, type DateStr } from "../lib/dates";
import { LEVELS, childLevel, occId, uid, type Area, type Commitment, type Evidence, type Habit, type HabitLog, type KeyResult, type KrPoint, type Level, type Objective, type Occurrence, type Review, type Rules, type Session, type Task, type Vision, type ObjStatus, type Execution, type Change, type Settings } from "../lib/model";
import { approvePlacements, completeOccurrence, missingOccurrences, unscheduleSession } from "./ops";
import { proposeSchedule, violation, type Context } from "./scheduler";

export interface AgentData { vision: Vision[]; areas: Area[]; objectives: Objective[]; krs: KeyResult[]; krPoints: KrPoint[]; tasks: Task[]; occurrences: Occurrence[]; sessions: Session[]; executions: Execution[]; habits: Habit[]; habitLogs: HabitLog[]; evidence: Evidence[]; commitments: Commitment[]; reviews: Review[]; changes: Change[] }
export interface ToolEnv { data: AgentData; settings: Settings; today: DateStr; context: () => Context; now: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ToolWrites { put?: Record<string, any[]>; del?: Record<string, string[]> }
const lastById = <T extends { id: string }>(l: T[]): T[] => [...new Map(l.map((x) => [x.id, x])).values()];
export type ToolOutcome = { error: string } | { writes?: ToolWrites; settingsPatch?: Partial<Settings>; result: Record<string, unknown>; summary: string };

type Schema = { type: string; description?: string; enum?: string[]; items?: Schema; properties?: Record<string, Schema>; required?: string[] };
export interface ToolDecl { name: string; description: string; parameters: Schema }
const S = (description: string): Schema => ({ type: "STRING", description });
const N = (description: string): Schema => ({ type: "NUMBER", description });
const B = (description: string): Schema => ({ type: "BOOLEAN", description });
const E = (values: string[], description: string): Schema => ({ type: "STRING", enum: values, description });
const DAYS = (d: string): Schema => ({ type: "ARRAY", items: { type: "NUMBER" }, description: d });
const obj = (properties: Record<string, Schema>, required: string[] = []): Schema => ({ type: "OBJECT", properties, ...(required.length ? { required } : {}) });
const DATE = "YYYY-MM-DD"; const MIN = "minutes after midnight (e.g. 540 = 09:00)";
const REC = obj({ kind: E(["daily", "weekdays", "weekly", "monthly"], "how often"), days: DAYS("for weekly: 0=Mon … 6=Sun"), until: S(`${DATE} last day`), startDate: S(`${DATE} first day`) }, ["kind"]);

export const TOOLS: ToolDecl[] = [
  { name: "set_vision", description: "Write or replace the user's life vision.", parameters: obj({ statement: S("the vision"), why: S("why it matters"), horizonYears: N("planning horizon in years, default 4") }, ["statement"]) },
  { name: "create_objective", description: "Create a goal/objective. With parentId the level is set automatically to the next level down. Without a parent, give a level (normally four-year).", parameters: obj({ title: S("a clear, measurable outcome"), level: E([...LEVELS], "four-year, annual, quarterly, monthly or weekly"), parentId: S("id of the parent objective"), why: S("motivation"), start: S(DATE), target: S(`${DATE} target date`), priority: N("1 (highest) to 4"), status: E(["draft", "active", "paused"], "default active"), areaName: S("life area name, created if new"), completionCriteria: S("what must be true for it to count as achieved"), evidenceRequired: B("require evidence") }, ["title"]) },
  { name: "update_objective", description: "Change fields of an existing objective (including status: completed, partial, paused, cancelled, archived).", parameters: obj({ id: S("objective id"), title: S("new title"), why: S("motivation"), description: S("details"), start: S(DATE), target: S(DATE), priority: N("1-4"), status: E(["draft", "active", "paused", "completed", "partial", "cancelled", "archived"], "new status"), completionCriteria: S("done-when"), evidenceRequired: B("require evidence"), areaName: S("life area") }, ["id"]) },
  { name: "archive_objective", description: "Archive an objective and, by default, everything beneath it (hidden, fully reversible by undo).", parameters: obj({ id: S("objective id"), includeChildren: B("default true") }, ["id"]) },
  { name: "create_key_result", description: "Add a measurable key result to an objective. Progress is measured from these.", parameters: obj({ objectiveId: S("objective id"), title: S("what is measured"), type: E(["numeric", "percent", "currency", "count", "binary"], "kind of measure"), direction: E(["up", "down"], "up if higher is better"), baseline: N("starting value"), target: N("goal value"), unit: S("unit, e.g. kg or words") }, ["objectiveId", "title"]) },
  { name: "update_key_result", description: "Change a key result's title, target, baseline, unit or direction.", parameters: obj({ id: S("key result id"), title: S("title"), baseline: N("start"), target: N("goal"), unit: S("unit"), direction: E(["up", "down"], "direction") }, ["id"]) },
  { name: "record_measurement", description: "Record a new measured value for a key result.", parameters: obj({ keyResultId: S("key result id"), value: N("the new value"), date: S(DATE), note: S("note") }, ["keyResultId", "value"]) },
  { name: "create_task", description: "Create a task. One-off tasks get onDate (default today). Repeating tasks use recurrence.", parameters: obj({ title: S("specific next action"), objectiveId: S("objective it serves"), estimateMin: N("5-480"), priority: N("1-4"), onDate: S(DATE), deadline: S(DATE), preferred: E(["any", "morning", "afternoon", "evening"], "time of day"), energy: E(["low", "medium", "high"], "energy needed"), notes: S("notes"), protectedTask: B("never auto-moved"), recurrence: REC, inbox: B("true = no date yet") }, ["title"]) },
  { name: "update_task", description: "Change an existing task. Changing onDate moves its planned occurrence.", parameters: obj({ id: S("task id"), title: S("title"), notes: S("notes"), objectiveId: S("objective id"), estimateMin: N("minutes"), priority: N("1-4"), onDate: S(DATE), deadline: S(DATE), preferred: E(["any", "morning", "afternoon", "evening"], "time of day"), energy: E(["low", "medium", "high"], "energy"), protectedTask: B("never auto-moved") }, ["id"]) },
  { name: "cancel_task", description: "Cancel a task and its upcoming occurrences (history is kept).", parameters: obj({ id: S("task id") }, ["id"]) },
  { name: "complete_task", description: "Record that the user did (or skipped) a task on a date. Creates a permanent execution record.", parameters: obj({ taskId: S("task id"), date: S(`${DATE}, default today`), outcome: E(["done", "partial", "skipped"], "what happened"), minutes: N("actual minutes spent"), percent: N("for partial: 0-100"), note: S("note"), reason: S("why partial/skipped") }, ["taskId", "outcome"]) },
  { name: "schedule_session", description: "Put a task on the calendar at a specific time (replaces its existing slot). Past times are refused; overlaps are allowed but reported as warnings.", parameters: obj({ taskId: S("task id"), date: S(DATE), startMin: N(MIN), endMin: N(MIN) }, ["taskId", "date", "startMin", "endMin"]) },
  { name: "unschedule_session", description: "Remove a task's calendar slot for a date (the task stays planned).", parameters: obj({ taskId: S("task id"), date: S(DATE) }, ["taskId", "date"]) },
  { name: "plan_period", description: "Run the deterministic scheduler over a date range for all unscheduled planned tasks and apply the result. Reports what could not be placed and why.", parameters: obj({ from: S(`${DATE}, default today`), to: S(`${DATE}, default today+6`) }) },
  { name: "create_commitment", description: "Add a fixed calendar item (appointment, protected time) that tasks are planned around.", parameters: obj({ title: S("title"), date: S(DATE), startMin: N(MIN), endMin: N(MIN), protectedBlock: B("protected focus time") }, ["title", "date", "startMin", "endMin"]) },
  { name: "update_commitment", description: "Change a manual commitment.", parameters: obj({ id: S("commitment id"), title: S("title"), date: S(DATE), startMin: N(MIN), endMin: N(MIN) }, ["id"]) },
  { name: "delete_commitment", description: "Remove a commitment from the calendar.", parameters: obj({ id: S("commitment id") }, ["id"]) },
  { name: "create_habit", description: "Create a recurring habit to track.", parameters: obj({ title: S("habit"), days: DAYS("0=Mon … 6=Sun; empty = every day"), objectiveId: S("objective id") }, ["title"]) },
  { name: "log_habit", description: "Mark a habit as done on a date (default today).", parameters: obj({ habitId: S("habit id"), date: S(DATE) }, ["habitId"]) },
  { name: "add_evidence", description: "Attach a note, link or number as evidence to an objective.", parameters: obj({ objectiveId: S("objective id"), text: S("the evidence") }, ["objectiveId", "text"]) },
  { name: "save_review", description: "Save a review (daily, weekly, monthly, quarterly or annual).", parameters: obj({ period: E(["daily", "weekly", "monthly", "quarterly", "annual"], "period"), periodStart: S(DATE), wins: S("wins"), misses: S("misses"), lessons: S("lessons"), adjustments: S("adjustments") }, ["period"]) },
  { name: "update_rules", description: "Change the user's scheduling rules (working hours, days, daily capacity, buffer, automatic rescheduling).", parameters: obj({ workStartMin: N(MIN), workEndMin: N(MIN), allowedDays: DAYS("0=Mon … 6=Sun"), maxDailyMin: N("30-960"), bufferMin: N("0-120"), autoReschedule: B("auto-reschedule missed work"), maxAutoMoves: N("0-10"), maxPostponeDays: N("1-60") }) },
];

type Args = Record<string, unknown>;
const err = (error: string): ToolOutcome => ({ error });
const has = (a: Args, k: string) => a[k] !== undefined && a[k] !== null;
const str = (a: Args, k: string, max = 300): string | undefined | Error => { if (!has(a, k)) return undefined; const v = a[k]; return typeof v === "string" && v.length <= max ? v.trim() : new Error(`${k} must be text up to ${max} characters`); };
const num = (a: Args, k: string, lo: number, hi: number, int = false): number | undefined | Error => { if (!has(a, k)) return undefined; const v = a[k]; const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN; return Number.isFinite(n) && n >= lo && n <= hi && (!int || Number.isInteger(n)) ? n : new Error(`${k} must be ${int ? "a whole number" : "a number"} from ${lo} to ${hi}`); };
const dte = (a: Args, k: string): DateStr | undefined | Error => { if (!has(a, k)) return undefined; return typeof a[k] === "string" && isDateStr(a[k]) ? (a[k] as DateStr) : new Error(`${k} must be a real date like ${DATE}`); };
const days = (a: Args, k: string): number[] | undefined | Error => { if (!has(a, k)) return undefined; const v = a[k]; return Array.isArray(v) && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) ? [...new Set(v as number[])].sort() : new Error(`${k} must be a list of weekday numbers 0 (Mon) to 6 (Sun)`); };
const firstError = (...v: unknown[]): string | null => { const e = v.find((x) => x instanceof Error) as Error | undefined; return e ? e.message : null; };
const subtree = (objs: Objective[], id: string): Objective[] => { const out: Objective[] = []; const walk = (i: string, d: number) => { if (d > 8) return; for (const o of objs.filter((x) => x.parentId === i)) { out.push(o); walk(o.id, d + 1); } }; walk(id, 0); return out; };
const one = <T extends { id: string }>(list: T[], id: unknown) => list.find((x) => x.id === id);

export function runTool(name: string, a: Args, env: ToolEnv): ToolOutcome {
  const { data, today, now } = env; const writes: ToolWrites = { put: {} }; const put = writes.put!;
  const oneOff = (t: Task) => !t.recurrence || t.recurrence.kind === "none";
  const finish = (summary: string, result: Record<string, unknown> = {}): ToolOutcome => ({ writes, result: { ok: true, ...result }, summary });
  const areaFor = (n: string | undefined): string | null => { if (!n) return null; const ex = data.areas.find((x) => x.name.toLowerCase() === n.toLowerCase()); if (ex) return ex.id; const ar: Area = { id: uid(), name: n, createdAt: now }; (put.areas ??= []).push(ar); return ar.id; };
  const ensureOcc = (t: Task, date: DateStr): Occurrence => { const id = occId(t.id, date); const ex = data.occurrences.find((o) => o.id === id) ?? (put.occurrences as Occurrence[] | undefined)?.find((o) => o.id === id); if (ex) return ex; const o: Occurrence = { id, taskId: t.id, date, status: "planned", moves: 0, createdAt: now }; (put.occurrences ??= []).push(o); return o; };
  switch (name) {
    case "set_vision": {
      const st = str(a, "statement", 600), why = str(a, "why", 600), y = num(a, "horizonYears", 1, 10, true); const e = firstError(st, why, y); if (e) return err(e); if (!st) return err("statement is required");
      const old = data.vision[0]; put.vision = [{ id: "vision", statement: st as string, why: (why as string | undefined) ?? old?.why ?? "", horizonStart: old?.horizonStart ?? today, horizonYears: (y as number | undefined) ?? old?.horizonYears ?? 4, updatedAt: now } satisfies Vision];
      return finish("Vision updated");
    }
    case "create_objective": {
      const title = str(a, "title", 140), why = str(a, "why", 400), cc = str(a, "completionCriteria", 400), area = str(a, "areaName", 60), start = dte(a, "start"), target = dte(a, "target"), pr = num(a, "priority", 1, 4, true);
      const e = firstError(title, why, cc, area, start, target, pr); if (e) return err(e); if (!title) return err("title is required");
      const parent = has(a, "parentId") ? one(data.objectives, a.parentId) : undefined; if (has(a, "parentId") && !parent) return err(`parentId ${String(a.parentId)} does not exist`);
      let level: Level; if (parent) { const c = childLevel(parent.level); if (!c) return err("a weekly commitment cannot have sub-objectives"); level = c; } else { if (!(LEVELS as readonly string[]).includes(String(a.level))) return err(`level is required without a parent: one of ${LEVELS.join(", ")}`); level = a.level as Level; }
      const s = (start as DateStr | undefined) ?? (parent && parent.start > today ? parent.start : today);
      const t = (target as DateStr | undefined) ?? parent?.target ?? addDays(s, level === "four-year" ? 365 * 4 : level === "annual" ? 365 : level === "quarterly" ? 90 : level === "monthly" ? 30 : 7);
      if (t <= s) return err(`target (${t}) must be after start (${s})`);
      const status = (["draft", "active", "paused"].includes(String(a.status)) ? a.status : "active") as ObjStatus;
      const o: Objective = { id: uid(), title: title as string, description: "", why: (why as string | undefined) ?? "", areaId: areaFor(area as string | undefined) ?? parent?.areaId ?? null, level, parentId: parent?.id ?? null, start: s, target: t, priority: ((pr as number | undefined) ?? parent?.priority ?? 2) as 1 | 2 | 3 | 4, status, completionCriteria: (cc as string | undefined) ?? "", evidenceRequired: a.evidenceRequired === true, createdAt: now, updatedAt: now };
      put.objectives = [o]; return finish(`Created ${level} objective “${o.title}”`, { id: o.id, level, start: s, target: t });
    }
    case "update_objective": {
      const o = one(data.objectives, a.id); if (!o) return err(`objective ${String(a.id)} does not exist`);
      const title = str(a, "title", 140), why = str(a, "why", 400), desc = str(a, "description", 600), cc = str(a, "completionCriteria", 400), area = str(a, "areaName", 60), start = dte(a, "start"), target = dte(a, "target"), pr = num(a, "priority", 1, 4, true);
      const e = firstError(title, why, desc, cc, area, start, target, pr); if (e) return err(e);
      if (has(a, "status") && !["draft", "active", "paused", "completed", "partial", "cancelled", "archived"].includes(String(a.status))) return err("status is not valid");
      const n: Objective = { ...o, ...(title ? { title: title as string } : {}), ...(why !== undefined ? { why: why as string } : {}), ...(desc !== undefined ? { description: desc as string } : {}), ...(cc !== undefined ? { completionCriteria: cc as string } : {}), ...(start ? { start: start as DateStr } : {}), ...(target ? { target: target as DateStr } : {}), ...(pr ? { priority: pr as 1 | 2 | 3 | 4 } : {}), ...(has(a, "status") ? { status: a.status as ObjStatus } : {}), ...(typeof a.evidenceRequired === "boolean" ? { evidenceRequired: a.evidenceRequired } : {}), updatedAt: now };
      if (area) n.areaId = areaFor(area as string); if (n.target <= n.start) return err("target must be after start");
      put.objectives = [n]; return finish(`Updated “${n.title}”`, { id: n.id });
    }
    case "archive_objective": {
      const o = one(data.objectives, a.id); if (!o) return err(`objective ${String(a.id)} does not exist`);
      const list = [o, ...(a.includeChildren === false ? [] : subtree(data.objectives, o.id))]; put.objectives = list.map((x) => ({ ...x, status: "archived" as const, updatedAt: now }));
      return finish(`Archived ${list.length} objective${list.length === 1 ? "" : "s"} (“${o.title}”${list.length > 1 ? " and below" : ""})`, { archived: list.length });
    }
    case "create_key_result": {
      const o = one(data.objectives, a.objectiveId); if (!o) return err(`objectiveId ${String(a.objectiveId)} does not exist`);
      const title = str(a, "title", 140), unit = str(a, "unit", 20), b = num(a, "baseline", -1e12, 1e12), t = num(a, "target", -1e12, 1e12); const e = firstError(title, unit, b, t); if (e) return err(e); if (!title) return err("title is required");
      const type = (["numeric", "percent", "currency", "count", "binary"].includes(String(a.type)) ? a.type : "numeric") as KeyResult["type"]; const direction = (a.direction === "down" ? "down" : "up") as "up" | "down";
      const baseline = type === "binary" ? 0 : (b as number | undefined) ?? 0; const target = type === "binary" ? 1 : (t as number | undefined);
      if (target === undefined) return err("target is required for a non-binary key result");
      if ((direction === "up" ? target - baseline : baseline - target) <= 0) return err(`for direction "${direction}" the target must be ${direction === "up" ? "above" : "below"} the baseline (${baseline})`);
      const k: KeyResult = { id: uid(), objectiveId: o.id, title: title as string, type, direction, baseline, target, unit: (unit as string | undefined) ?? "", currency: type === "currency" ? "EUR" : "", createdAt: now };
      put.krs = [k]; return finish(`Added key result “${k.title}” (${baseline} → ${target}) to “${o.title}”`, { id: k.id });
    }
    case "update_key_result": {
      const k = one(data.krs, a.id); if (!k) return err(`key result ${String(a.id)} does not exist`);
      const title = str(a, "title", 140), unit = str(a, "unit", 20), b = num(a, "baseline", -1e12, 1e12), t = num(a, "target", -1e12, 1e12); const e = firstError(title, unit, b, t); if (e) return err(e);
      const n: KeyResult = { ...k, ...(title ? { title: title as string } : {}), ...(unit !== undefined ? { unit: unit as string } : {}), ...(b !== undefined ? { baseline: b as number } : {}), ...(t !== undefined ? { target: t as number } : {}), ...(a.direction === "up" || a.direction === "down" ? { direction: a.direction } : {}) };
      if (n.type !== "binary" && (n.direction === "up" ? n.target - n.baseline : n.baseline - n.target) <= 0) return err("the target must be beyond the baseline in the stated direction");
      put.krs = [n]; return finish(`Updated key result “${n.title}”`, { id: n.id });
    }
    case "record_measurement": {
      const k = one(data.krs, a.keyResultId); if (!k) return err(`keyResultId ${String(a.keyResultId)} does not exist`);
      const v = num(a, "value", -1e12, 1e12), d = dte(a, "date"), note = str(a, "note", 200); const e = firstError(v, d, note); if (e) return err(e); if (v === undefined) return err("value is required");
      const p: KrPoint = { id: uid(), krId: k.id, date: (d as DateStr | undefined) ?? today, value: v as number, note: (note as string | undefined) ?? "", createdAt: now }; put.krPoints = [p];
      return finish(`Recorded ${v} for “${k.title}”`, { id: p.id });
    }
    case "create_task": {
      const title = str(a, "title", 140), notes = str(a, "notes", 600), est = num(a, "estimateMin", 5, 480, true), pr = num(a, "priority", 1, 4, true), on = dte(a, "onDate"), dl = dte(a, "deadline");
      const e = firstError(title, notes, est, pr, on, dl); if (e) return err(e); if (!title) return err("title is required");
      if (has(a, "objectiveId") && !one(data.objectives, a.objectiveId)) return err(`objectiveId ${String(a.objectiveId)} does not exist`);
      let recurrence: Task["recurrence"] = null;
      if (has(a, "recurrence")) { const r = a.recurrence as Args; if (!r || typeof r !== "object" || !["daily", "weekdays", "weekly", "monthly"].includes(String(r.kind))) return err("recurrence.kind must be daily, weekdays, weekly or monthly"); const d2 = days(r, "days"), u = dte(r, "until"), sd = dte(r, "startDate"); const e2 = firstError(d2, u, sd); if (e2) return err(e2); recurrence = { kind: r.kind as "daily", days: (d2 as number[] | undefined) ?? [], interval: 1, start: (sd as DateStr | undefined) ?? today, until: (u as DateStr | undefined) ?? null, count: null, paused: false }; }
      const t: Task = { id: uid(), title: title as string, notes: (notes as string | undefined) ?? "", objectiveId: (a.objectiveId as string | undefined) ?? null, priority: ((pr as number | undefined) ?? 2) as 1 | 2 | 3 | 4, estimateMin: (est as number | undefined) ?? 45, deadline: (dl as DateStr | undefined) ?? null, earliestStart: null, preferred: (["any", "morning", "afternoon", "evening"].includes(String(a.preferred)) ? a.preferred : "any") as Task["preferred"], energy: (["low", "medium", "high"].includes(String(a.energy)) ? a.energy : "medium") as Task["energy"], flexibility: "flexible", protectedTask: a.protectedTask === true, recurrence, onDate: recurrence || a.inbox === true ? null : (on as DateStr | undefined) ?? today, status: "active", createdAt: now };
      put.tasks = [t]; put.occurrences = missingOccurrences([t], data.occurrences, today, addDays(today, 21), now);
      return finish(`Created task “${t.title}”${t.onDate ? ` for ${t.onDate}` : recurrence ? ` (repeats ${recurrence.kind})` : " in the inbox"}`, { id: t.id, onDate: t.onDate });
    }
    case "update_task": {
      const t = one(data.tasks, a.id); if (!t) return err(`task ${String(a.id)} does not exist`);
      const title = str(a, "title", 140), notes = str(a, "notes", 600), est = num(a, "estimateMin", 5, 480, true), pr = num(a, "priority", 1, 4, true), on = dte(a, "onDate"), dl = dte(a, "deadline"); const e = firstError(title, notes, est, pr, on, dl); if (e) return err(e);
      if (has(a, "objectiveId") && a.objectiveId !== "" && !one(data.objectives, a.objectiveId)) return err(`objectiveId ${String(a.objectiveId)} does not exist`);
      const n: Task = { ...t, ...(title ? { title: title as string } : {}), ...(notes !== undefined ? { notes: notes as string } : {}), ...(est ? { estimateMin: est as number } : {}), ...(pr ? { priority: pr as 1 | 2 | 3 | 4 } : {}), ...(dl ? { deadline: dl as DateStr } : {}), ...(has(a, "objectiveId") ? { objectiveId: (a.objectiveId as string) || null } : {}), ...(["any", "morning", "afternoon", "evening"].includes(String(a.preferred)) ? { preferred: a.preferred as Task["preferred"] } : {}), ...(["low", "medium", "high"].includes(String(a.energy)) ? { energy: a.energy as Task["energy"] } : {}), ...(typeof a.protectedTask === "boolean" ? { protectedTask: a.protectedTask } : {}) };
      if (on && oneOff(t) && on !== t.onDate) {
        n.onDate = on as DateStr; const occs: Occurrence[] = [];
        const old = data.occurrences.filter((o) => o.taskId === t.id && (o.status === "planned" || o.status === "in-progress")); occs.push(...old.map((o) => ({ ...o, status: "cancelled" as const })));
        const oldIds = new Set(old.map((o) => o.id)); const cs = data.sessions.filter((s) => oldIds.has(s.occId) && s.state === "approved").map((s) => ({ ...s, state: "cancelled" as const })); if (cs.length) put.sessions = cs;
        const id = occId(t.id, on as DateStr); const ex = data.occurrences.find((o) => o.id === id);
        if (ex) occs.push({ ...ex, status: "planned" as const }); else occs.push({ id, taskId: t.id, date: on as DateStr, status: "planned", moves: 0, createdAt: now });
        put.occurrences = lastById(occs);
      }
      put.tasks = [n]; return finish(`Updated task “${n.title}”`, { id: n.id });
    }
    case "cancel_task": {
      const t = one(data.tasks, a.id); if (!t) return err(`task ${String(a.id)} does not exist`);
      put.tasks = [{ ...t, status: "cancelled" as const }]; put.occurrences = data.occurrences.filter((o) => o.taskId === t.id && (o.status === "planned" || o.status === "in-progress") && o.date >= today).map((o) => ({ ...o, status: "cancelled" as const }));
      return finish(`Cancelled task “${t.title}”`, { cancelledOccurrences: put.occurrences.length });
    }
    case "complete_task": {
      const t = one(data.tasks, a.taskId); if (!t) return err(`task ${String(a.taskId)} does not exist`);
      const d = dte(a, "date"), m = num(a, "minutes", 0, 1440), p = num(a, "percent", 0, 100), note = str(a, "note", 400), reason = str(a, "reason", 200); const e = firstError(d, m, p, note, reason); if (e) return err(e);
      if (!["done", "partial", "skipped"].includes(String(a.outcome))) return err("outcome must be done, partial or skipped");
      const date = (d as DateStr | undefined) ?? today; const occ = ensureOcc(t, date);
      const r = completeOccurrence(occ, t, { outcome: a.outcome as "done", minutes: (m as number | undefined) ?? t.estimateMin, pct: (p as number | undefined) ?? null, note: (note as string | undefined) ?? "", reason: (reason as string | undefined) ?? "" }, date, now);
      put.occurrences = [r.occurrence]; put.executions = [r.execution]; return finish(`Recorded “${t.title}” as ${a.outcome} on ${date}`, { minutes: r.execution.minutes });
    }
    case "schedule_session": {
      const t = one(data.tasks, a.taskId); if (!t) return err(`task ${String(a.taskId)} does not exist`);
      const d = dte(a, "date"), s = num(a, "startMin", 0, 1439, true), en = num(a, "endMin", 1, 1440, true); const e = firstError(d, s, en); if (e) return err(e);
      if (!d || s === undefined || en === undefined) return err("date, startMin and endMin are required");
      if ((en as number) <= (s as number)) return err("endMin must be after startMin"); if ((d as DateStr) < today) return err("that date is in the past");
      const ctx = env.context(); if (d === today && (s as number) < ctx.now) return err(`that time has already passed today (it is ${minToHM(ctx.now)})`);
      const date = d as DateStr;
      const base = oneOff(t) ? (data.occurrences.find((o) => o.taskId === t.id && (o.status === "planned" || o.status === "in-progress"))) : undefined; const occ = base ?? ensureOcc(t, date);
      const warn = violation({ date, startMin: s as number, endMin: en as number }, { deadline: t.deadline, earliestStart: t.earliestStart, estimateMin: Math.min(t.estimateMin, (en as number) - (s as number)) }, ctx);
      const pool = [...data.occurrences.filter((o) => o.id !== occ.id), occ];
      const ap = approvePlacements([{ occId: occ.id, taskId: t.id, date, startMin: s as number, endMin: en as number, why: "set by the assistant" }], pool, data.sessions, "Assistant", now);
      put.sessions = ap.sessions; put.changes = ap.changes; const occs = [...((put.occurrences as Occurrence[]) ?? []), ...ap.occurrences]; if (base && base.date !== date && !ap.occurrences.length) occs.push({ ...base, date }); if (occs.length) put.occurrences = lastById(occs);
      if (oneOff(t) && t.onDate !== date) put.tasks = [{ ...t, onDate: date }];
      return finish(`Scheduled “${t.title}” on ${date} ${minToHM(s as number)}–${minToHM(en as number)}`, { warning: warn ?? undefined });
    }
    case "unschedule_session": {
      const t = one(data.tasks, a.taskId); const d = dte(a, "date"); if (!t) return err(`task ${String(a.taskId)} does not exist`); if (d instanceof Error || !d) return err("date is required as YYYY-MM-DD");
      const ids = new Set(data.occurrences.filter((o) => o.taskId === t.id).map((o) => o.id)); const s = data.sessions.find((x) => ids.has(x.occId) && x.date === d && x.state === "approved"); if (!s) return err(`“${t.title}” has no scheduled slot on ${d}`);
      const u = unscheduleSession(s, t.id, "Removed by the assistant", now); put.sessions = u.sessions; put.changes = u.changes; return finish(`Unscheduled “${t.title}” on ${d}`);
    }
    case "plan_period": {
      const f = dte(a, "from"), to = dte(a, "to"); const e = firstError(f, to); if (e) return err(e); const from = (f as DateStr | undefined) ?? today; const end = (to as DateStr | undefined) ?? addDays(today, 6); if (end < from || diffDays(from, end) > 60) return err("the range must be 0 to 60 days");
      const fresh = missingOccurrences(data.tasks.filter((t) => t.status === "active"), data.occurrences, from, end, now); const occs = [...data.occurrences, ...fresh]; const live = new Set(data.sessions.filter((s) => s.state === "approved" && s.date >= today).map((s) => s.occId));
      const items = occs.filter((o) => o.status === "planned" && o.date <= end && !live.has(o.id)).flatMap((o) => { const t = data.tasks.find((x) => x.id === o.taskId); return t && t.status === "active" ? [{ occId: o.id, taskId: t.id, date: o.date < from ? from : o.date, estimateMin: t.estimateMin, priority: t.priority, deadline: t.deadline, earliestStart: t.earliestStart, preferred: t.preferred, flexibility: t.flexibility }] : []; });
      const plan = proposeSchedule(items, env.context(), { from, to: end }); const ap = approvePlacements(plan.placements, occs, data.sessions, "Assistant plan", now);
      put.sessions = ap.sessions; put.changes = ap.changes; put.occurrences = [...fresh.filter((o) => !ap.occurrences.some((x) => x.id === o.id)), ...ap.occurrences];
      return finish(`Scheduled ${plan.placements.length} task${plan.placements.length === 1 ? "" : "s"}${plan.unplaced.length ? `, ${plan.unplaced.length} could not be placed` : ""}`, { scheduled: plan.placements.map((p) => ({ taskId: p.taskId, date: p.date, start: minToHM(p.startMin), end: minToHM(p.endMin) })), unplaced: plan.unplaced.map((u) => ({ taskId: occs.find((o) => o.id === u.occId)?.taskId, reason: u.reason })) });
    }
    case "create_commitment": {
      const title = str(a, "title", 140), d = dte(a, "date"), s = num(a, "startMin", 0, 1439, true), en = num(a, "endMin", 1, 1440, true); const e = firstError(title, d, s, en); if (e) return err(e); if (!title || !d || s === undefined || en === undefined) return err("title, date, startMin and endMin are required"); if ((en as number) <= (s as number)) return err("endMin must be after startMin");
      const c: Commitment = { id: uid(), title: title as string, date: d as DateStr, startMin: s as number, endMin: en as number, source: "manual", externalId: null, protectedBlock: a.protectedBlock === true, createdAt: now };
      const clash = data.sessions.filter((x) => x.state === "approved" && x.date === c.date && x.startMin < c.endMin && x.endMin > c.startMin).length; put.commitments = [c];
      return finish(`Added “${c.title}” on ${c.date} ${minToHM(c.startMin)}–${minToHM(c.endMin)}`, { id: c.id, overlapsScheduledTasks: clash });
    }
    case "update_commitment": {
      const c = one(data.commitments, a.id); if (!c) return err(`commitment ${String(a.id)} does not exist`); if (c.source === "ics") return err("imported calendar events cannot be edited; delete and re-import instead");
      const title = str(a, "title", 140), d = dte(a, "date"), s = num(a, "startMin", 0, 1439, true), en = num(a, "endMin", 1, 1440, true); const e = firstError(title, d, s, en); if (e) return err(e);
      const n: Commitment = { ...c, ...(title ? { title: title as string } : {}), ...(d ? { date: d as DateStr } : {}), ...(s !== undefined ? { startMin: s as number } : {}), ...(en !== undefined ? { endMin: en as number } : {}) }; if (n.endMin <= n.startMin) return err("endMin must be after startMin");
      put.commitments = [n]; return finish(`Updated “${n.title}”`, { id: n.id });
    }
    case "delete_commitment": { const c = one(data.commitments, a.id); if (!c) return err(`commitment ${String(a.id)} does not exist`); writes.del = { commitments: [c.id] }; return finish(`Removed “${c.title}”`); }
    case "create_habit": {
      const title = str(a, "title", 100), d = days(a, "days"); const e = firstError(title, d); if (e) return err(e); if (!title) return err("title is required"); if (has(a, "objectiveId") && !one(data.objectives, a.objectiveId)) return err(`objectiveId ${String(a.objectiveId)} does not exist`);
      const h: Habit = { id: uid(), title: title as string, objectiveId: (a.objectiveId as string | undefined) ?? null, days: (d as number[] | undefined) ?? [], createdAt: now, archived: false }; put.habits = [h]; return finish(`Created habit “${h.title}”`, { id: h.id });
    }
    case "log_habit": {
      const h = one(data.habits, a.habitId); if (!h) return err(`habit ${String(a.habitId)} does not exist`); const d = dte(a, "date"); if (d instanceof Error) return err(d.message); const date = (d as DateStr | undefined) ?? today;
      if (data.habitLogs.some((l) => l.habitId === h.id && l.date === date)) return finish(`“${h.title}” was already logged for ${date}`, { already: true });
      put.habitLogs = [{ id: uid(), habitId: h.id, date, createdAt: now } satisfies HabitLog]; return finish(`Logged “${h.title}” for ${date}`);
    }
    case "add_evidence": {
      const o = one(data.objectives, a.objectiveId); if (!o) return err(`objectiveId ${String(a.objectiveId)} does not exist`); const text = str(a, "text", 500); if (text instanceof Error) return err(text.message); if (!text) return err("text is required");
      put.evidence = [{ id: uid(), objectiveId: o.id, krId: null, occId: null, kind: /^https?:\/\//.test(text) ? "link" : "note", text, createdAt: now } satisfies Evidence]; return finish(`Added evidence to “${o.title}”`);
    }
    case "save_review": {
      if (!["daily", "weekly", "monthly", "quarterly", "annual"].includes(String(a.period))) return err("period must be daily, weekly, monthly, quarterly or annual");
      const ps = dte(a, "periodStart"), w = str(a, "wins", 800), m = str(a, "misses", 800), l = str(a, "lessons", 800), ad = str(a, "adjustments", 800); const e = firstError(ps, w, m, l, ad); if (e) return err(e);
      const start = (ps as DateStr | undefined) ?? today; const prior = data.reviews.find((r) => r.period === a.period && r.periodStart === start);
      put.reviews = [{ id: prior?.id ?? uid(), period: a.period as Review["period"], periodStart: start, wins: (w as string | undefined) ?? prior?.wins ?? "", misses: (m as string | undefined) ?? prior?.misses ?? "", lessons: (l as string | undefined) ?? prior?.lessons ?? "", adjustments: (ad as string | undefined) ?? prior?.adjustments ?? "", snapshot: prior?.snapshot ?? {}, createdAt: prior?.createdAt ?? now } satisfies Review]; return finish(`Saved ${a.period} review`);
    }
    case "update_rules": {
      const ws = num(a, "workStartMin", 0, 1439, true), we = num(a, "workEndMin", 1, 1440, true), md = num(a, "maxDailyMin", 30, 960, true), bf = num(a, "bufferMin", 0, 120, true), ma = num(a, "maxAutoMoves", 0, 10, true), mp = num(a, "maxPostponeDays", 1, 60, true), ad = days(a, "allowedDays"); const e = firstError(ws, we, md, bf, ma, mp, ad); if (e) return err(e);
      const r: Rules = { ...env.settings.rules, ...(ws !== undefined ? { workStart: ws as number } : {}), ...(we !== undefined ? { workEnd: we as number } : {}), ...(md !== undefined ? { maxDailyMin: md as number } : {}), ...(bf !== undefined ? { bufferMin: bf as number } : {}), ...(ma !== undefined ? { maxAutoMoves: ma as number } : {}), ...(mp !== undefined ? { maxPostponeDays: mp as number } : {}), ...(ad ? { allowedDays: ad as number[] } : {}), ...(typeof a.autoReschedule === "boolean" ? { autoReschedule: a.autoReschedule } : {}) };
      if (r.workEnd <= r.workStart) return err("workEndMin must be after workStartMin"); if (!r.allowedDays.length) return err("at least one working day is required");
      return { settingsPatch: { rules: r }, result: { ok: true, rules: r }, summary: "Updated scheduling rules" };
    }
    default: return err(`unknown tool "${name}"`);
  }
}
