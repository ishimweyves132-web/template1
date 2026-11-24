import { useEffect, useState } from "react";
import { useApp } from "../store";
import { Card, Empty, PageHead } from "../ui/kit";
import { PlanSheet } from "./sheets";
import { Assistant } from "./Assistant";
import { AiResult, useAiRun, type AiRun } from "./ai";
import { addDays, range } from "../lib/dates";
import { analyze } from "../domain/coach";
import { buildAiRequest } from "../domain/aiGuard";
import { freeIntervals } from "../domain/scheduler";
import { aiStatus, aiTarget, type AiStatus } from "../lib/aiClient";
import type { Recovery } from "../domain/reschedule";

export function Coach() {
  const { today, db, settings, objectives, krs, krPoints, tasks, occurrences, sessions, executions, recover, notify, context } = useApp();
  const [plan, setPlan] = useState(false); const [rec, setRec] = useState<Recovery | null>(null); const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<AiRun | null>(null); const [err, setErr] = useState(""); const [status, setStatus] = useState<AiStatus | null>(null); const runAi = useAiRun();
  useEffect(() => { void aiStatus(db, settings).then(setStatus); }, [db, settings]);
  const insights = analyze({ today, rules: settings.rules, objectives, krs, points: krPoints, tasks, occurrences, sessions, executions });
  const go = (a?: string) => a === "plan-week" ? setPlan(true) : a === "recover" ? void recover().then((r) => { setRec(r); notify(r.mutation.changes.length ? `${r.mutation.changes.length} rescheduled within your rules` : "Nothing could be moved automatically"); }) : a === "open-vision" ? (location.hash = "#/vision") : a === "open-planner" ? (location.hash = "#/planner") : undefined;
  const taskName = (id: string) => tasks.find((t) => t.id === id)?.title ?? "Task";
  const ask = async () => {
    setBusy(true); setErr(""); setRun(null);
    const ctx = context(); const open = occurrences.filter((o) => o.status === "planned" && o.date <= addDays(today, 6) && !sessions.some((s) => s.occId === o.id && s.state === "approved"));
    const free = Object.fromEntries(range(today, addDays(today, 6)).map((x) => [x, freeIntervals(x, ctx)]));
    const req = buildAiRequest({ today, tasks: open.flatMap((o) => { const t = tasks.find((x) => x.id === o.taskId); return t ? [{ id: t.id, title: t.title, estimateMin: t.estimateMin, priority: t.priority, deadline: t.deadline }] : []; }), free, rules: settings.rules });
    try { setRun(await runAi({ ...req, occurrences: open.map((o) => ({ occId: o.id, taskId: o.taskId })), objectives: objectives.filter((o) => o.status === "active").slice(0, 20).map((o) => ({ id: o.id, level: o.level, title: o.title.slice(0, 80) })) })); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div>
      <PageHead title="Assistant" sub="Ask in plain words. It knows your whole plan and does the work for you." right={<button className="btn primary" onClick={() => setPlan(true)}>Plan my next 7 days</button>} />
      <div className="cols">
        <Card title="What the coach sees">
          {insights.length === 0 ? <Empty>Nothing needs attention. Your plan is consistent with your own rules.</Empty> : insights.map((i) => <div key={i.id} className={`insight ${i.level}`}><b>{i.title}</b><p className="small muted">{i.detail}</p>{i.action && <button className="btn small" onClick={() => go(i.action)}>{{ "plan-week": "Plan the week", recover: "Recover within my rules", "open-vision": "Open Vision", "open-planner": "Open Planner" }[i.action]}</button>}</div>)}
          {rec && rec.needsApproval.length > 0 && <div className="insight attention"><b>Needs your decision</b>{rec.needsApproval.map((n) => <p key={n.occId} className="small">{taskName(occurrences.find((o) => o.id === n.occId)?.taskId ?? "")}: {n.reason}</p>)}</div>}
        </Card>
        <div>
          {settings.aiProvider === "gemini" && <Assistant />}
          <Card title="Rule-based coach (no AI needed)">
            <p className="small">The observations on the left come from your own records, without AI. It can move eligible missed tasks inside the rules you set.</p>
            
            <p className="small muted">Every automatic move appears under Planner → Recent changes and can be undone.</p>
          </Card>
          {settings.aiProvider === "gateway" && <Card title="AI planning suggestions (gateway)">
            {status && !status.ready ? <><p className="small muted">{status.why} The coach above works without any AI.</p><a className="btn small" href="#/settings">Open Settings</a></> : <>
              <p className="small muted">Sends only task titles, durations, deadlines, objective titles and free time windows (no notes, evidence, files or calendar event titles) to {aiTarget(settings)}. Its answer is checked against your rules before anything can change.</p>
              <button className="btn block" disabled={busy || !status} onClick={ask}>{busy ? "Asking…" : "Ask for a weekly plan"}</button></>}
            {err && <p className="small" style={{ color: "var(--warn)" }} role="alert">{err} Nothing was changed.</p>}
            {run && <AiResult run={run} onDone={() => setRun(null)} />}
          </Card>}
        </div>
      </div>
      {plan && <PlanSheet from={today} to={addDays(today, 6)} title="Plan my next 7 days" onClose={() => setPlan(false)} />}
    </div>
  );
}
