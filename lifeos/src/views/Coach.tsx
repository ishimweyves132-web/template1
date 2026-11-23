import { useState } from "react";
import { useApp } from "../store";
import { Card, Empty, PageHead } from "../ui/kit";
import { PlanSheet } from "./sheets";
import { addDays, minToHM, range } from "../lib/dates";
import { analyze } from "../domain/coach";
import { buildAiRequest, callGateway, validateAi, type AiOp } from "../domain/aiGuard";
import { freeIntervals } from "../domain/scheduler";
import { missingOccurrences } from "../domain/ops";
import { uid, type AiAudit, type Task } from "../lib/model";
import type { Recovery } from "../domain/reschedule";

export function Coach() {
  const d = useApp(); const { today, settings, objectives, krs, krPoints, tasks, occurrences, sessions, executions, recover, notify, commit, context, approve } = d;
  const [plan, setPlan] = useState(false); const [rec, setRec] = useState<Recovery | null>(null); const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<{ ops: AiOp[]; rejected: { reasons: string[] }[]; auditId: string } | null>(null); const [err, setErr] = useState("");
  const insights = analyze({ today, rules: settings.rules, objectives, krs, points: krPoints, tasks, occurrences, sessions, executions });
  const run = (a?: string) => a === "plan-week" ? setPlan(true) : a === "recover" ? void recover().then((r) => { setRec(r); notify(r.mutation.changes.length ? `${r.mutation.changes.length} rescheduled within your rules` : "Nothing could be moved automatically"); }) : a === "open-vision" ? (location.hash = "#/vision") : a === "open-planner" ? (location.hash = "#/planner") : undefined;
  const taskName = (id: string) => tasks.find((t) => t.id === id)?.title ?? "Task";

  const askAi = async () => {
    setBusy(true); setErr(""); setAi(null);
    const ctx = context(); const open = occurrences.filter((o) => o.status === "planned" && o.date <= addDays(today, 6) && !sessions.some((s) => s.occId === o.id && s.state === "approved"));
    const free = Object.fromEntries(range(today, addDays(today, 6)).map((x) => [x, freeIntervals(x, ctx)]));
    const req = buildAiRequest({ today, tasks: open.flatMap((o) => { const t = tasks.find((x) => x.id === o.taskId); return t ? [{ id: t.id, title: t.title, estimateMin: t.estimateMin, priority: t.priority, deadline: t.deadline }] : []; }), free, rules: settings.rules });
    const audit: AiAudit = { id: uid(), at: Date.now(), provider: new URL(settings.aiGatewayUrl).host, request: JSON.stringify(req).slice(0, 4000), proposal: "", validation: "rejected", reasons: [], approval: "pending" };
    try {
      const raw = await callGateway(settings.aiGatewayUrl, { ...req, occurrences: open.map((o) => ({ occId: o.id, taskId: o.taskId })) });
      const v = validateAi(raw, { ctx, tasks, objectives, occurrences });
      audit.proposal = JSON.stringify(raw).slice(0, 4000); audit.validation = v.accepted.length ? "accepted" : "rejected"; audit.reasons = v.rejected.flatMap((r) => r.reasons); audit.approval = v.accepted.length ? "pending" : "n/a";
      await commit({ put: { aiAudit: [audit] } }); setAi({ ops: v.accepted, rejected: v.rejected, auditId: audit.id });
    } catch (e) { audit.reasons = [(e as Error).message]; audit.approval = "n/a"; await commit({ put: { aiAudit: [audit] } }); setErr((e as Error).message); }
    setBusy(false);
  };
  const applyAi = async () => {
    if (!ai) return; const sched = ai.ops.filter((o): o is Extract<AiOp, { op: "propose_schedule" }> => o.op === "propose_schedule");
    const newTasks: Task[] = ai.ops.filter((o): o is Extract<AiOp, { op: "propose_task" }> => o.op === "propose_task").map((o) => ({ id: uid(), title: o.title, notes: `Suggested by AI: ${o.why}`, objectiveId: o.objectiveId, priority: o.priority, estimateMin: o.estimateMin, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: o.onDate, status: "active", createdAt: Date.now() }));
    if (newTasks.length) await commit({ put: { tasks: newTasks, occurrences: missingOccurrences(newTasks, occurrences, today, addDays(today, 21)) } });
    if (sched.length) await approve(sched.map((o) => ({ occId: o.occId, taskId: o.taskId, date: o.date, startMin: o.startMin, endMin: o.endMin, why: `AI suggestion: ${o.why || "proposed"}` })), "Approved AI suggestion");
    const a = d.aiAudit.find((x) => x.id === ai.auditId); if (a) await commit({ put: { aiAudit: [{ ...a, approval: "approved" }] } });
    notify("Applied the validated suggestions you approved"); setAi(null);
  };
  const aiReady = settings.aiEnabled && /^https?:\/\//.test(settings.aiGatewayUrl);
  return (
    <div>
      <PageHead title="Coach" sub="Plain observations from your own records. It suggests; you decide." right={<button className="btn primary" onClick={() => setPlan(true)}>Plan my next 7 days</button>} />
      <div className="cols">
        <Card title="What the coach sees">
          {insights.length === 0 ? <Empty>Nothing needs attention. Your plan is consistent with your own rules.</Empty> : insights.map((i) => <div key={i.id} className={`insight ${i.level}`}><b>{i.title}</b><p className="small muted">{i.detail}</p>{i.action && <button className="btn small" onClick={() => run(i.action)}>{{ "plan-week": "Plan the week", recover: "Recover within my rules", "open-vision": "Open Vision", "open-planner": "Open Planner" }[i.action]}</button>}</div>)}
          {rec && rec.needsApproval.length > 0 && <div className="insight attention"><b>Needs your decision</b>{rec.needsApproval.map((n) => <p key={n.occId} className="small">{taskName(occurrences.find((o) => o.id === n.occId)?.taskId ?? "")}: {n.reason}</p>)}</div>}
        </Card>
        <div>
          <Card title="What the coach may and may not do">
            <p className="small"><b>May:</b> suggest tasks and times, flag overload, point out neglected goals, move eligible missed tasks inside the rules you set.</p>
            <p className="small"><b>May not:</b> change your vision, goals, targets or deadlines; delete anything; mark work done; move calendar events or protected tasks; change its own permissions.</p>
            <p className="small muted">Every automatic move appears under Planner → Recent changes and can be undone.</p>
          </Card>
          <Card title="AI planning assistant (optional)">
            {!aiReady ? <p className="small muted">Not connected. The coach above works without any AI. To use a language model, add your own gateway address in Settings. LifeOS never ships an API key; the gateway holds it. Its answers are checked against your rules before anything can change.</p> : <>
              <p className="small muted">Sends only task titles, durations, deadlines and free time windows (no notes, evidence or calendar event titles) to {new URL(settings.aiGatewayUrl).host}.</p>
              <button className="btn block" disabled={busy} onClick={askAi}>{busy ? "Asking…" : "Ask for a weekly plan"}</button></>}
            {err && <p className="small" style={{ color: "var(--warn)" }} role="alert">{err}. Nothing was changed.</p>}
            {ai && <div style={{ marginTop: 12 }}>
              {ai.ops.length === 0 ? <p className="small">The assistant's answer contained nothing that passed validation. Nothing was changed.</p> : <>
                <h3>Validated suggestions</h3>{ai.ops.map((o, i) => <p key={i} className="small">• {o.op === "propose_schedule" ? `${taskName(o.taskId)}: ${o.date} ${minToHM(o.startMin)}–${minToHM(o.endMin)}` : o.op === "propose_task" ? `New task: ${o.title} (${o.estimateMin} min)` : o.text}</p>)}
                <button className="btn primary block" onClick={applyAi}>Approve these</button></>}
              {ai.rejected.length > 0 && <div className="insight attention"><b>{ai.rejected.length} rejected</b>{ai.rejected.slice(0, 5).map((r, i) => <p key={i} className="small">{r.reasons.join("; ")}</p>)}</div>}
            </div>}
          </Card>
        </div>
      </div>
      {plan && <PlanSheet from={today} to={addDays(today, 6)} title="Plan my next 7 days" onClose={() => setPlan(false)} />}
    </div>
  );
}
