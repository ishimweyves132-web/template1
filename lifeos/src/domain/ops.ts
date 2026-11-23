// Pure operations: each returns the records to write. Nothing here overwrites history.
import { addDays, type DateStr } from "../lib/dates";
import { occId, uid, type Change, type Execution, type Habit, type HabitLog, type Occurrence, type Session, type Task } from "../lib/model";
import { taskDates } from "./recurrence";
import type { Placement } from "./scheduler";

export interface CompleteInput { outcome: "done" | "partial" | "skipped"; minutes: number; pct?: number | null; note?: string; reason?: string; startTs?: number | null; endTs?: number | null }
/** Records what actually happened. Every call creates a NEW execution record; earlier ones (e.g. a repeated task) are preserved. */
export function completeOccurrence(occ: Occurrence, task: Task, input: CompleteInput, today: DateStr, now = Date.now()): { occurrence: Occurrence; execution: Execution } {
  const minutes = input.outcome === "skipped" ? 0 : Math.max(0, Math.round(input.minutes));
  const execution: Execution = { id: uid(), occId: occ.id, taskId: task.id, date: today, startTs: input.startTs ?? null, endTs: input.endTs ?? null, minutes, outcome: input.outcome, pct: input.outcome === "partial" ? Math.max(0, Math.min(100, input.pct ?? 50)) : input.outcome === "done" ? 100 : 0, note: input.note ?? "", reason: input.reason ?? "", createdAt: now };
  return { occurrence: { ...occ, status: input.outcome === "done" ? "done" : input.outcome === "partial" ? "partial" : "skipped" }, execution };
}

/** Occurrences that should exist in [from, to] for the given tasks but do not yet. Idempotent: running twice creates nothing new. */
export function missingOccurrences(tasks: Task[], existing: Occurrence[], from: DateStr, to: DateStr, now = Date.now()): Occurrence[] {
  const have = new Set(existing.map((o) => o.id)); const out: Occurrence[] = [];
  for (const t of tasks) for (const d of taskDates(t, from, to)) { const id = occId(t.id, d); if (!have.has(id)) { have.add(id); out.push({ id, taskId: t.id, date: d, status: "planned", moves: 0, createdAt: now }); } }
  return out;
}
/** Planned occurrences from before today become "missed" (recorded, never silently deleted). */
export function settleMissed(occs: Occurrence[], today: DateStr): Occurrence[] {
  return occs.filter((o) => o.date < today && (o.status === "planned" || o.status === "in-progress")).map((o) => ({ ...o, status: "missed" as const }));
}

export interface Approval { sessions: Session[]; changes: Change[]; occurrences: Occurrence[] }
/** Turn approved placements into sessions. A previous approved session for the same occurrence is cancelled and kept in the change record. */
export function approvePlacements(placements: Placement[], occs: Occurrence[], sessions: Session[], reason: string, now = Date.now()): Approval {
  const out: Approval = { sessions: [], changes: [], occurrences: [] };
  for (const p of placements) {
    const occ = occs.find((o) => o.id === p.occId); if (!occ) continue;
    const prev = sessions.find((s) => s.occId === p.occId && s.state === "approved");
    if (prev) out.sessions.push({ ...prev, state: "cancelled" });
    const s: Session = { id: uid(), occId: p.occId, date: p.date, startMin: p.startMin, endMin: p.endMin, state: "approved", reason: `${reason}: ${p.why}`, createdAt: now };
    out.sessions.push(s);
    if (occ.date !== p.date) out.occurrences.push({ ...occ, date: p.date });
    out.changes.push({ id: uid(), occId: p.occId, taskId: p.taskId, kind: prev ? "reschedule" : "schedule", auto: false, reason, before: prev ? { date: prev.date, startMin: prev.startMin, endMin: prev.endMin } : null, after: { date: p.date, startMin: p.startMin, endMin: p.endMin }, beforeOccDate: occ.date, afterOccDate: p.date, sessionId: s.id, undone: false, createdAt: now });
  }
  return out;
}
export function toggleHabit(habit: Habit, logs: HabitLog[], date: DateStr, now = Date.now()): { add?: HabitLog; remove?: HabitLog } {
  const ex = logs.find((l) => l.habitId === habit.id && l.date === date);
  return ex ? { remove: ex } : { add: { id: uid(), habitId: habit.id, date, createdAt: now } };
}
export const horizon = (today: DateStr, days = 21) => ({ from: today, to: addDays(today, days) });
