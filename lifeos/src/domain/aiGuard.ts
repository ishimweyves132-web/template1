// AI suggests -> this guard validates -> the user approves -> the database records. Anything outside the allow-list is rejected.
import { addDays, type DateStr } from "../lib/dates";
import type { Objective, Task } from "../lib/model";
import { violation, type Busy, type Context, type Item } from "./scheduler";

export type AiOp =
  | { op: "propose_schedule"; taskId: string; occId: string; date: DateStr; startMin: number; endMin: number; why: string }
  | { op: "propose_task"; title: string; estimateMin: number; objectiveId: string | null; priority: 1 | 2 | 3 | 4; onDate: DateStr | null; why: string }
  | { op: "advice"; text: string };
export interface Verdict { accepted: AiOp[]; rejected: { raw: unknown; reasons: string[] }[] }
const FORBIDDEN = new Set(["update_objective", "delete_objective", "change_target", "change_deadline", "change_vision", "delete_goal", "mark_completed", "move_external_event", "delete_event", "change_rules", "change_permissions", "update_key_result"]);
const isDate = (s: unknown): s is DateStr => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;
const text = (s: unknown, max: number): s is string => typeof s === "string" && s.trim().length > 0 && s.length <= max;

export interface GuardContext { ctx: Context; tasks: Task[]; objectives: Objective[]; occurrences: { id: string; taskId: string; status: string }[]; maxOps?: number }
/** Validate raw model output (any JSON). Nothing here touches storage: callers apply only `accepted`, after user approval. */
export function validateAi(raw: unknown, g: GuardContext): Verdict {
  const v: Verdict = { accepted: [], rejected: [] };
  const list = typeof raw === "object" && raw !== null && Array.isArray((raw as { operations?: unknown }).operations) ? (raw as { operations: unknown[] }).operations : null;
  if (!list) { v.rejected.push({ raw, reasons: ["response is not {\"operations\": [...]}"] }); return v; }
  const seen = new Set<string>(); const placed: { date: DateStr; busy: Busy }[] = [];   // accepted proposals block each other
  for (const op of list.slice(0, g.maxOps ?? 50)) {
    const reasons: string[] = []; const o = op as Record<string, unknown>;
    if (typeof op !== "object" || op === null || typeof o.op !== "string") { v.rejected.push({ raw: op, reasons: ["not an operation"] }); continue; }
    if (FORBIDDEN.has(o.op)) { v.rejected.push({ raw: op, reasons: [`AI is not permitted to ${o.op.replace(/_/g, " ")}`] }); continue; }
    const key = JSON.stringify(op); if (seen.has(key)) { v.rejected.push({ raw: op, reasons: ["duplicate proposal"] }); continue; } seen.add(key);
    if (o.op === "advice") { if (text(o.text, 600)) v.accepted.push({ op: "advice", text: o.text.trim() }); else v.rejected.push({ raw: op, reasons: ["advice needs text up to 600 characters"] }); continue; }
    if (o.op === "propose_task") {
      if (!text(o.title, 120)) reasons.push("title is required (max 120)");
      if (!isInt(o.estimateMin, 5, 480)) reasons.push("estimateMin must be a whole number from 5 to 480");
      if (o.objectiveId !== null && o.objectiveId !== undefined && !g.objectives.some((x) => x.id === o.objectiveId)) reasons.push("objectiveId does not exist");
      if (o.onDate !== null && o.onDate !== undefined && !isDate(o.onDate)) reasons.push("onDate is not a valid date");
      if (!isInt(o.priority ?? 2, 1, 4)) reasons.push("priority must be 1 to 4");
      if (reasons.length) v.rejected.push({ raw: op, reasons });
      else v.accepted.push({ op: "propose_task", title: (o.title as string).trim(), estimateMin: o.estimateMin as number, objectiveId: (o.objectiveId as string | null | undefined) ?? null, priority: ((o.priority as 1 | 2 | 3 | 4 | undefined) ?? 2), onDate: (o.onDate as DateStr | null | undefined) ?? null, why: typeof o.why === "string" ? o.why.slice(0, 300) : "" });
      continue;
    }
    if (o.op === "propose_schedule") {
      const task = g.tasks.find((t) => t.id === o.taskId); const occ = g.occurrences.find((x) => x.id === o.occId);
      if (!task) reasons.push("unknown task"); if (!occ || occ.taskId !== o.taskId) reasons.push("unknown occurrence for that task");
      if (occ && ["done", "partial", "skipped", "cancelled"].includes(occ.status)) reasons.push("that occurrence is already resolved");
      if (!isDate(o.date) || !isInt(o.startMin, 0, 1439) || !isInt(o.endMin, 1, 1440)) reasons.push("date/startMin/endMin are invalid");
      if (!reasons.length && v.accepted.some((x) => x.op === "propose_schedule" && x.occId === o.occId)) reasons.push("that task already has an accepted proposal");
      if (!reasons.length && task) {
        const item: Pick<Item, "deadline" | "earliestStart" | "estimateMin"> = { deadline: task.deadline, earliestStart: task.earliestStart, estimateMin: task.estimateMin };
        const why = violation({ date: o.date as DateStr, startMin: o.startMin as number, endMin: o.endMin as number }, item, g.ctx, placed.filter((p) => p.date === o.date).map((p) => p.busy));
        if (why) reasons.push(`rule violation: ${why}`);
      }
      if (reasons.length) v.rejected.push({ raw: op, reasons });
      else { v.accepted.push({ op: "propose_schedule", taskId: o.taskId as string, occId: o.occId as string, date: o.date as DateStr, startMin: o.startMin as number, endMin: o.endMin as number, why: typeof o.why === "string" ? o.why.slice(0, 300) : "" }); placed.push({ date: o.date as DateStr, busy: { startMin: o.startMin as number, endMin: o.endMin as number, kind: "session", id: String(o.occId) } }); }
      continue;
    }
    v.rejected.push({ raw: op, reasons: [`unknown operation "${o.op}"`] });
  }
  return v;
}
/** The minimum context the model needs. No calendar event titles or descriptions, no notes, no evidence text. */
export function buildAiRequest(args: { today: DateStr; tasks: { id: string; title: string; estimateMin: number; priority: number; deadline: DateStr | null }[]; free: Record<string, { start: number; end: number }[]>; rules: { maxDailyMin: number } }) {
  return { today: args.today, horizonEnd: addDays(args.today, 6), tasks: args.tasks.map((t) => ({ id: t.id, title: t.title.slice(0, 80), estimateMin: t.estimateMin, priority: t.priority, deadline: t.deadline })), freeWindows: args.free, maxDailyMin: args.rules.maxDailyMin, allowedOperations: ["propose_schedule", "propose_task", "advice"] };
}
export async function callGateway(url: string, body: unknown, fetchImpl: typeof fetch = fetch, timeoutMs = 20000): Promise<unknown> {
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) throw new Error("The gateway address must use https");
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    if (!res.ok) throw new Error(`The AI gateway answered HTTP ${res.status}`);
    return await res.json();
  } catch (e) { if (ctl.signal.aborted) throw new Error("The AI gateway did not answer in time"); throw e; } finally { clearTimeout(t); }
}
