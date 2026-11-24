import { useState } from "react";
import { useApp } from "../store";
import { addDays, minToHM } from "../lib/dates";
import { uid, type AiAudit, type Objective, type Task } from "../lib/model";
import { validateAi, type AiOp, type Verdict } from "../domain/aiGuard";
import { askModel, aiTarget } from "../lib/aiClient";
import { missingOccurrences } from "../domain/ops";

export interface AiRun { verdict: Verdict; auditId: string }
/** Runs one AI request end to end: ask, validate, record an audit entry. Returns the validated verdict; nothing is applied yet. */
export function useAiRun() {
  const { db, settings, commit, objectives, tasks, occurrences, context } = useApp();
  return async (request: unknown): Promise<AiRun> => {
    const audit: AiAudit = { id: uid(), at: Date.now(), provider: aiTarget(settings), request: JSON.stringify(request).slice(0, 4000), proposal: "", validation: "rejected", reasons: [], approval: "n/a" };
    try {
      const raw = await askModel(db, settings, request); const verdict = validateAi(raw, { ctx: context(), tasks, objectives, occurrences });
      audit.proposal = JSON.stringify(raw).slice(0, 4000); audit.validation = verdict.accepted.length ? "accepted" : "rejected"; audit.reasons = verdict.rejected.flatMap((r) => r.reasons); audit.approval = verdict.accepted.length ? "pending" : "n/a";
      await commit({ put: { aiAudit: [audit] } }); return { verdict, auditId: audit.id };
    } catch (e) { audit.reasons = [(e as Error).message]; await commit({ put: { aiAudit: [audit] } }); throw e; }
  };
}

const describe = (o: AiOp, taskName: (id: string) => string) =>
  o.op === "propose_schedule" ? `Schedule “${taskName(o.taskId)}” on ${o.date}, ${minToHM(o.startMin)}–${minToHM(o.endMin)}` : o.op === "propose_task" ? `New task: ${o.title} (${o.estimateMin} min${o.onDate ? ", " + o.onDate : ""})` : o.op === "propose_objective" ? `New ${o.level} objective: ${o.title} (${o.start} → ${o.target})` : o.text;

/** Shows what passed validation and what did not. Approving applies ONLY validated suggestions. Objectives are created as drafts. */
export function AiResult({ run, onDone }: { run: AiRun; onDone: () => void }) {
  const { tasks, objectives, occurrences, commit, approve, today, notify, aiAudit } = useApp(); const [off, setOff] = useState<Set<number>>(new Set());
  const ops = run.verdict.accepted; const chosen = ops.filter((_, i) => !off.has(i)); const actionable = chosen.filter((o) => o.op !== "advice");
  const apply = async () => {
    const sched = chosen.filter((o): o is Extract<AiOp, { op: "propose_schedule" }> => o.op === "propose_schedule");
    const newTasks: Task[] = chosen.filter((o): o is Extract<AiOp, { op: "propose_task" }> => o.op === "propose_task").map((o) => ({ id: uid(), title: o.title, notes: `Suggested by AI: ${o.why}`, objectiveId: o.objectiveId, priority: o.priority, estimateMin: o.estimateMin, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: o.onDate, status: "active", createdAt: Date.now() }));
    const newObjs: Objective[] = chosen.filter((o): o is Extract<AiOp, { op: "propose_objective" }> => o.op === "propose_objective").map((o) => { const p = objectives.find((x) => x.id === o.parentId)!; return { id: uid(), title: o.title, description: "", why: o.why, areaId: p.areaId, level: o.level, parentId: p.id, start: o.start, target: o.target, priority: p.priority, status: "draft", completionCriteria: "", evidenceRequired: false, createdAt: Date.now(), updatedAt: Date.now() }; });
    if (newTasks.length || newObjs.length) await commit({ put: { tasks: newTasks, objectives: newObjs, occurrences: missingOccurrences(newTasks, occurrences, today, addDays(today, 21)) } });
    if (sched.length) await approve(sched.map((o) => ({ occId: o.occId, taskId: o.taskId, date: o.date, startMin: o.startMin, endMin: o.endMin, why: `AI suggestion: ${o.why || "proposed"}` })), "Approved AI suggestion");
    const a = aiAudit.find((x) => x.id === run.auditId); if (a) await commit({ put: { aiAudit: [{ ...a, approval: "approved" }] } });
    notify(newObjs.length ? `Applied. ${newObjs.length} new objective${newObjs.length === 1 ? " is" : "s are"} saved as draft: review and activate ${newObjs.length === 1 ? "it" : "them"} in Vision.` : "Applied the validated suggestions you approved"); onDone();
  };
  const taskName = (id: string) => tasks.find((t) => t.id === id)?.title ?? "Task";
  return (
    <div style={{ marginTop: 12 }}>
      {ops.length === 0 ? <p className="small">Nothing in the answer passed validation, so nothing was changed.</p> : <>
        <h3>Validated suggestions</h3>
        {ops.map((o, i) => o.op === "advice" ? <p key={i} className="small">💬 {o.text}</p> : <label key={i} className="row" style={{ padding: "6px 0" }}><input type="checkbox" checked={!off.has(i)} onChange={() => setOff((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; })} /><span className="small">{describe(o, taskName)}</span></label>)}
        {actionable.length > 0 && <button className="btn primary block" onClick={apply}>Approve {actionable.length} selected</button>}
      </>}
      {run.verdict.rejected.length > 0 && <div className="insight attention"><b>{run.verdict.rejected.length} rejected</b>{run.verdict.rejected.slice(0, 6).map((r, i) => <p key={i} className="small">{r.reasons.join("; ")}</p>)}</div>}
    </div>
  );
}
