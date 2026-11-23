// Automatic rescheduling inside the user's approved rules. Every move is recorded and reversible.
import { addDays, type DateStr } from "../lib/dates";
import { uid, type Change, type Occurrence, type Rules, type Session, type Task } from "../lib/model";
import { proposeSchedule, type Context, type Item } from "./scheduler";

export interface AutoCheck { ok: boolean; reason: string }
/** May this occurrence be moved WITHOUT asking? Defaults follow the product spec's protections. */
export function canAutoMove(occ: Occurrence, task: Task, rules: Rules, today: DateStr): AutoCheck {
  if (!rules.autoReschedule) return { ok: false, reason: "automatic rescheduling is turned off" };
  if (["done", "partial", "skipped", "cancelled"].includes(occ.status)) return { ok: false, reason: "already resolved; completed work is never moved" };
  if (task.protectedTask) return { ok: false, reason: "protected task" };
  if (task.flexibility === "fixed") return { ok: false, reason: "fixed appointment" };
  if (task.recurrence && task.recurrence.kind !== "none") return { ok: false, reason: "recurring: the next occurrence is already planned" };
  if (occ.moves >= rules.maxAutoMoves) return { ok: false, reason: `already moved ${occ.moves} times; this needs your decision` };
  if (task.deadline && today > task.deadline) return { ok: false, reason: "the deadline has passed; the deadline is never changed automatically" };
  return { ok: true, reason: "" };
}
const toItem = (occ: Occurrence, task: Task, date: DateStr): Item => ({ occId: occ.id, taskId: task.id, date, estimateMin: task.estimateMin, priority: task.priority, deadline: task.deadline, earliestStart: task.earliestStart, preferred: task.preferred, flexibility: task.flexibility });

export interface Mutation { sessions: Session[]; occurrences: Occurrence[]; changes: Change[] }
export interface Recovery { mutation: Mutation; needsApproval: { occId: string; reason: string }[] }

/** For missed occurrences: move the eligible ones into the earliest valid future slot, report the rest. Pure: caller persists the mutation. */
export function recoverMissed(missed: { occ: Occurrence; task: Task; current: Session | null }[], ctx: Context, now = Date.now()): Recovery {
  const out: Recovery = { mutation: { sessions: [], occurrences: [], changes: [] }, needsApproval: [] };
  const eligible: { occ: Occurrence; task: Task; current: Session | null }[] = [];
  for (const m of missed) { const c = canAutoMove(m.occ, m.task, ctx.rules, ctx.today); if (c.ok) eligible.push(m); else out.needsApproval.push({ occId: m.occ.id, reason: c.reason }); }
  const byOcc = new Map(eligible.map((m) => [m.occ.id, m]));
  const items = eligible.map((m) => toItem(m.occ, m.task, ctx.today));
  const horizonTo = (m: { occ: Occurrence; task: Task }) => { const lim = addDays(m.occ.date, ctx.rules.maxPostponeDays); return m.task.deadline && m.task.deadline < lim ? m.task.deadline : lim; };
  // each item gets its own horizon (original date + permitted postponement), so schedule them one at a time against the growing plan
  const extra: Session[] = [];
  const ctx2: Context = { ...ctx, busy: (d) => [...ctx.busy(d), ...extra.filter((s) => s.date === d).map((s) => ({ startMin: s.startMin, endMin: s.endMin, kind: "session" as const, id: s.occId }))] };
  for (const it of items) {
    const m = byOcc.get(it.occId)!; const to = horizonTo(m);
    const { placements, unplaced } = proposeSchedule([it], ctx2, { from: ctx.today, to });
    const p = placements[0];
    if (!p) { out.needsApproval.push({ occId: it.occId, reason: unplaced[0]?.reason ?? "no valid slot inside your rules" }); continue; }
    const s: Session = { id: uid(), occId: it.occId, date: p.date, startMin: p.startMin, endMin: p.endMin, state: "approved", reason: `auto-rescheduled: ${p.why}`, createdAt: now };
    extra.push(s);
    out.mutation.sessions.push(s);
    out.mutation.occurrences.push({ ...m.occ, date: p.date, status: "planned", moves: m.occ.moves + 1 });
    out.mutation.changes.push({ id: uid(), occId: it.occId, taskId: it.taskId, kind: "reschedule", auto: true, reason: `Missed on ${m.occ.date}; moved within your rules`, before: m.current ? { date: m.current.date, startMin: m.current.startMin, endMin: m.current.endMin } : null, after: { date: p.date, startMin: p.startMin, endMin: p.endMin }, beforeOccDate: m.occ.date, afterOccDate: p.date, sessionId: s.id, undone: false, createdAt: now });
  }
  return out;
}

/** Undo one change: only allowed while it is the occurrence's latest change and its session is still in place. */
export function undoChange(change: Change, sessions: Session[], occ: Occurrence, later: Change[], now = Date.now()): { ok: true; mutation: Mutation } | { ok: false; reason: string } {
  if (change.undone) return { ok: false, reason: "already undone" };
  if (later.some((c) => c.occId === change.occId && !c.undone && c.createdAt > change.createdAt)) return { ok: false, reason: "a later change exists; undo that first" };
  const cur = sessions.find((s) => s.id === change.sessionId);
  const out: Mutation = { sessions: [], occurrences: [], changes: [] };
  if (cur) out.sessions.push({ ...cur, state: "cancelled" });
  if (change.before) out.sessions.push({ id: uid(), occId: change.occId, date: change.before.date, startMin: change.before.startMin, endMin: change.before.endMin, state: "approved", reason: "restored by undo", createdAt: now });
  out.occurrences.push({ ...occ, date: change.beforeOccDate, status: "planned", moves: change.auto ? Math.max(0, occ.moves - 1) : occ.moves });
  out.changes.push({ ...change, undone: true });
  return { ok: true, mutation: out };
}
