import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { Bar, Empty, Field, Segmented, Sheet } from "../ui/kit";
import { addDays, formatDate, formatMinutes, hmToMin, isDateStr, minToHM, range, weekdayIndex, type DateStr } from "../lib/dates";
import { LEVELS, LEVEL_LABEL, childLevel, uid, type Area, type Commitment, type Evidence, type KeyResult, type KrPoint, type KrType, type Level, type Objective, type Preferred, type Review, type Task } from "../lib/model";
import { elapsedFraction, krFraction, latestValue, objectiveOutcome, pace, trail } from "../domain/progress";
import { missingOccurrences, sessionConflicts } from "../domain/ops";
import { executionStats } from "../domain/evaluation";
import type { Placement } from "../domain/scheduler";
import { AttachButton, EvidenceItems, useAddFileEvidence } from "./evidence";
import { AiResult, useAiRun, type AiRun } from "./ai";
import { aiStatus, buildBreakdownRequest } from "../lib/aiClient";
import { fmtSize } from "../lib/attachments";

export const objLabel = (o: Objective | undefined, all: Objective[]) => trail(o, all).map((x) => x.title).join(" › ");
/** Compact breadcrumb for lists: the root goal and the objective itself ("Become a published author › Write chapters 1 to 4"). */
export const shortTrail = (o: Objective | undefined, all: Objective[]) => { const t = trail(o, all); return t.length <= 2 ? t.map((x) => x.title).join(" › ") : `${t[0]!.title} › … › ${t[t.length - 1]!.title}`; };
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------------- complete a task (what actually happened) ----------------
export function CompleteSheet({ occId, minutes, startTs, onClose }: { occId: string; minutes?: number; startTs?: number | null; onClose: () => void }) {
  const { occurrences, tasks, complete, commit, notify, objectives } = useApp();
  const occ = occurrences.find((o) => o.id === occId); const task = tasks.find((t) => t.id === occ?.taskId);
  const [outcome, setOutcome] = useState<"done" | "partial" | "skipped">("done"); const [mins, setMins] = useState(String(minutes ?? task?.estimateMin ?? 30)); const [pct, setPct] = useState("50");
  const [note, setNote] = useState(""); const [reason, setReason] = useState(""); const [proof, setProof] = useState(""); const [file, setFile] = useState<File | null>(null); const addFile = useAddFileEvidence();
  if (!occ || !task) return null;
  const m = Number(mins); const bad = outcome !== "skipped" && (!Number.isFinite(m) || m < 0 || m > 1440);
  return (
    <Sheet title={task.title} onClose={onClose}>
      <p className="crumb">{objLabel(objectives.find((o) => o.id === task.objectiveId), objectives) || "Independent task"} · planned {formatMinutes(task.estimateMin)}</p>
      <p className="small muted">Completion is recorded separately from time and from goal progress.</p>
      <Segmented label="Outcome" value={outcome} onChange={setOutcome} options={[{ v: "done", t: "Done" }, { v: "partial", t: "Partly" }, { v: "skipped", t: "Skipped" }]} />
      <div style={{ height: 14 }} />
      {outcome !== "skipped" && <div className="row2"><Field label="Actual minutes" error={bad ? "Enter 0 to 1440" : ""}><input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} /></Field>
        {outcome === "partial" && <Field label="How much was done (%)"><input inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, ""))} /></Field>}</div>}
      {outcome !== "done" && <Field label={outcome === "skipped" ? "Why was it skipped?" : "What got in the way?"} hint="Optional, but it helps the weekly review."><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
      <Field label="Notes"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {outcome !== "skipped" && <Field label="Evidence (optional)" hint="A result, link or number that shows the work happened."><input value={proof} onChange={(e) => setProof(e.target.value)} /></Field>}
      {outcome !== "skipped" && <div className="row wrap" style={{ margin: "-4px 0 12px" }}><AttachButton label="Attach a file" onFile={(f) => { setFile(f); }} />{file && <span className="small muted">{file.name} · {fmtSize(file.size)}</span>}</div>}
      <button className="btn primary block" disabled={bad} onClick={async () => {
        await complete(occId, { outcome, minutes: m, pct: Number(pct), note, reason, startTs: startTs ?? null, endTs: startTs ? Date.now() : null });
        if (file && outcome !== "skipped") { try { await addFile(file, { objectiveId: task.objectiveId, occId }); } catch (x) { notify((x as Error).message); } }
        if (proof.trim()) await commit({ put: { evidence: [{ id: uid(), objectiveId: task.objectiveId, krId: null, occId, kind: /^https?:/.test(proof) ? "link" : "note", text: proof.trim(), createdAt: Date.now() }] } });
        notify(outcome === "done" ? "Recorded as done" : outcome === "partial" ? "Recorded as partly done" : "Recorded as skipped"); onClose();
      }}>Save</button>
    </Sheet>
  );
}

// ---------------- create / edit a task ----------------
export function TaskSheet({ task, objectiveId, date, onClose }: { task?: Task; objectiveId?: string | null; date?: DateStr | null; onClose: () => void }) {
  const { objectives, commit, today, occurrences, notify } = useApp();
  const [f, setF] = useState<Task>(task ?? { id: uid(), title: "", notes: "", objectiveId: objectiveId ?? null, priority: 2, estimateMin: 45, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: date === undefined ? today : date, status: "active", createdAt: Date.now() });
  const [rk, setRk] = useState<string>(task?.recurrence?.kind ?? "none"); const [days, setDays] = useState<number[]>(task?.recurrence?.days ?? []); const [est, setEst] = useState(String(f.estimateMin));
  const e = Number(est); const err = !f.title.trim() ? "Give it a title" : !Number.isInteger(e) || e < 5 || e > 480 ? "Estimate: 5 to 480 minutes" : "";
  const ok = f.deadline === null || isDateStr(f.deadline);
  return (
    <Sheet title={task ? "Edit task" : "New task"} onClose={onClose}>
      <Field label="Task"><input value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} placeholder="What will you do?" /></Field>
      <Field label="Serves which objective?" hint="Every meaningful task should trace to a goal. Leave empty for an independent task."><select value={f.objectiveId ?? ""} onChange={(x) => setF({ ...f, objectiveId: x.target.value || null })}><option value="">Independent</option>{objectives.filter((o) => o.status !== "archived" && o.status !== "cancelled").map((o) => <option key={o.id} value={o.id}>{LEVEL_LABEL[o.level]} · {objLabel(o, objectives)}</option>)}</select></Field>
      <div className="row2"><Field label="Estimated minutes" error={err.startsWith("Estimate") ? err : ""}><input inputMode="numeric" value={est} onChange={(x) => { setEst(x.target.value.replace(/\D/g, "")); }} /></Field>
        <Field label="Priority"><select value={f.priority} onChange={(x) => setF({ ...f, priority: Number(x.target.value) as 1 | 2 | 3 | 4 })}><option value={1}>1 · Critical</option><option value={2}>2 · High</option><option value={3}>3 · Normal</option><option value={4}>4 · Low</option></select></Field></div>
      <div className="row2"><Field label="Do it on"><input type="date" value={f.onDate ?? ""} onChange={(x) => setF({ ...f, onDate: x.target.value || null })} disabled={rk !== "none"} /></Field>
        <Field label="Deadline" error={ok ? "" : "Invalid date"}><input type="date" value={f.deadline ?? ""} onChange={(x) => setF({ ...f, deadline: x.target.value || null })} /></Field></div>
      <div className="row2"><Field label="Best time of day"><select value={f.preferred} onChange={(x) => setF({ ...f, preferred: x.target.value as Preferred })}><option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select></Field>
        <Field label="Energy needed"><select value={f.energy} onChange={(x) => setF({ ...f, energy: x.target.value as Task["energy"] })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field></div>
      <Field label="Repeats"><select value={rk} onChange={(x) => setRk(x.target.value)}><option value="none">Does not repeat</option><option value="daily">Every day</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly on chosen days</option><option value="monthly">Monthly</option></select></Field>
      {rk === "weekly" && <div className="row wrap" style={{ marginBottom: 14 }}>{WD.map((d, i) => <button key={d} className={`chip ${days.includes(i) ? "on" : ""}`} aria-pressed={days.includes(i)} onClick={() => setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i])}>{d}</button>)}</div>}
      <label className="row" style={{ margin: "0 0 10px" }}><input type="checkbox" checked={f.flexibility === "fixed"} onChange={(x) => setF({ ...f, flexibility: x.target.checked ? "fixed" : "flexible" })} /> <span className="small">Fixed: never moved automatically</span></label>
      <label className="row" style={{ margin: "0 0 10px" }}><input type="checkbox" checked={f.protectedTask} onChange={(x) => setF({ ...f, protectedTask: x.target.checked })} /> <span className="small">Protected: always asks before moving</span></label>
      <Field label="Notes"><textarea rows={2} value={f.notes} onChange={(x) => setF({ ...f, notes: x.target.value })} /></Field>
      {err && !err.startsWith("Estimate") && <p className="small" style={{ color: "var(--warn)" }}>{err}</p>}
      <button className="btn primary block" disabled={!!err || !ok} onClick={async () => {
        const rec = rk === "none" ? null : { kind: rk as "daily" | "weekdays" | "weekly" | "monthly", days: rk === "weekly" ? days : [], interval: 1, start: f.onDate ?? task?.recurrence?.start ?? today, until: null, count: null, paused: false };
        const t: Task = { ...f, title: f.title.trim(), estimateMin: e, recurrence: rec, onDate: rec ? null : f.onDate };
        const fresh = missingOccurrences([t], occurrences, today, addDays(today, 21));
        await commit({ put: { tasks: [t], occurrences: fresh } }); notify(task ? "Task updated" : "Task added"); onClose();
      }}>Save task</button>
      {task && <button className="btn danger block" onClick={async () => { if (confirm("Cancel this task? Its history is kept.")) { await commit({ put: { tasks: [{ ...task, status: "cancelled" }], occurrences: occurrences.filter((o) => o.taskId === task.id && o.date >= today && (o.status === "planned" || o.status === "in-progress")).map((o) => ({ ...o, status: "cancelled" as const })) } }); onClose(); } }}>Cancel task</button>}
    </Sheet>
  );
}

// ---------------- objective: edit + key results + tasks + evidence ----------------
export function ObjectiveSheet({ id, parentId, level, onClose }: { id?: string; parentId?: string | null; level?: Level; onClose: () => void }) {
  const { objectives, areas, krs, krPoints, tasks, evidence, commit, today, notify, db, settings } = useApp();
  const ex = objectives.find((o) => o.id === id); const parent = objectives.find((o) => o.id === (ex?.parentId ?? parentId));
  const lvl: Level = ex?.level ?? level ?? (parent ? (childLevel(parent.level) ?? "weekly") : "four-year");
  const [f, setF] = useState<Objective>(ex ?? { id: uid(), title: "", description: "", why: "", areaId: parent?.areaId ?? null, level: lvl, parentId: parent?.id ?? null, start: parent ? (parent.start > today ? parent.start : today) : today, target: parent ? parent.target : addDays(today, 365 * (lvl === "four-year" ? 4 : 1)), priority: 2, status: "active", completionCriteria: "", evidenceRequired: false, createdAt: Date.now(), updatedAt: Date.now() });
  const addFile = useAddFileEvidence(); const runAi = useAiRun(); const [aiRun, setAiRun] = useState<AiRun | null>(null); const [aiBusy, setAiBusy] = useState(false); const [aiErr, setAiErr] = useState(""); const [aiOk, setAiOk] = useState<string>("checking");
  useEffect(() => { void aiStatus(db, settings).then((s) => setAiOk(s.ready ? "" : s.why)); }, [db, settings]);
  const [newArea, setNewArea] = useState(""); const [taskOpen, setTaskOpen] = useState(false); const [proof, setProof] = useState(""); const [krForm, setKrForm] = useState(false);
  const mineK = krs.filter((k) => k.objectiveId === f.id); const oc = ex ? objectiveOutcome(ex, objectives, krs, krPoints) : null; const pc = ex && oc ? pace(ex, oc, today) : null;
  const err = !f.title.trim() ? "Give it a title" : f.target < f.start ? "The target date is before the start" : "";
  const save = async () => { const rec = { ...f, title: f.title.trim(), updatedAt: Date.now() }; await commit({ put: { objectives: [rec] } }); notify(ex ? "Saved" : "Added"); if (!ex) onClose(); };
  return (
    <Sheet title={ex ? "Objective" : LEVEL_LABEL[lvl]} onClose={onClose}>
      {parent && <p className="crumb">Part of <b>{objLabel(parent, objectives)}</b></p>}
      <Field label="Title" error={err && !f.title.trim() ? err : ""}><input value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} placeholder="A clear outcome, not a vague intention" /></Field>
      <Field label="Why does this matter to you?"><textarea rows={2} value={f.why} onChange={(x) => setF({ ...f, why: x.target.value })} /></Field>
      <div className="row2"><Field label="Starts"><input type="date" value={f.start} onChange={(x) => setF({ ...f, start: x.target.value })} /></Field><Field label="Target date" error={err.startsWith("The target") ? err : ""}><input type="date" value={f.target} onChange={(x) => setF({ ...f, target: x.target.value })} /></Field></div>
      <div className="row2"><Field label="Life area"><select value={f.areaId ?? ""} onChange={(x) => setF({ ...f, areaId: x.target.value || null })}><option value="">None</option>{areas.map((a: Area) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Status"><select value={f.status} onChange={(x) => setF({ ...f, status: x.target.value as Objective["status"] })}>{["draft", "active", "paused", "completed", "partial", "cancelled", "archived"].map((s) => <option key={s} value={s}>{s === "partial" ? "partially achieved" : s}</option>)}</select></Field></div>
      <div className="row"><input placeholder="New life area" value={newArea} onChange={(x) => setNewArea(x.target.value)} /><button className="btn small" disabled={!newArea.trim()} onClick={async () => { const a: Area = { id: uid(), name: newArea.trim(), createdAt: Date.now() }; await commit({ put: { areas: [a] } }); setF({ ...f, areaId: a.id }); setNewArea(""); }}>Add</button></div>
      <div style={{ height: 14 }} />
      <Field label="Completion criteria" hint="What must be true for this to count as achieved? Finishing its tasks does not complete a goal."><textarea rows={2} value={f.completionCriteria} onChange={(x) => setF({ ...f, completionCriteria: x.target.value })} /></Field>
      <label className="row" style={{ margin: "0 0 12px" }}><input type="checkbox" checked={f.evidenceRequired} onChange={(x) => setF({ ...f, evidenceRequired: x.target.checked })} /> <span className="small">Requires evidence of achievement</span></label>
      <button className="btn primary block" disabled={!!err} onClick={save}>{ex ? "Save changes" : "Add"}</button>
      {ex && (
        <>
          <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "22px 0" }} />
          <div className="card-h"><h3>Measured results</h3><button className="btn small" onClick={() => setKrForm(true)}>＋ Key result</button></div>
          {oc && <p className="small muted">{oc.fraction === null ? "Not measurable yet. Add a key result so progress reflects outcomes." : `Outcome ${Math.round(oc.fraction * 100)}% · time used ${Math.round(elapsedFraction(ex, today) * 100)}% · ${pc}`}</p>}
          {mineK.length === 0 && <Empty>No key results yet.</Empty>}
          {mineK.map((k) => <KrRow key={k.id} kr={k} points={krPoints} />)}
          {krForm && <KrForm objectiveId={ex.id} onDone={() => setKrForm(false)} />}
          <div className="card-h" style={{ marginTop: 22 }}><h3>Tasks</h3><button className="btn small" onClick={() => setTaskOpen(true)}>＋ Task</button></div>
          {tasks.filter((t) => t.objectiveId === ex.id && t.status === "active").map((t) => <p key={t.id} className="small">• {t.title} <span className="muted">· {formatMinutes(t.estimateMin)}{t.recurrence ? " · repeats" : ""}</span></p>)}
          {!tasks.some((t) => t.objectiveId === ex.id && t.status === "active") && <Empty>No tasks yet.</Empty>}
          {taskOpen && <TaskSheet objectiveId={ex.id} onClose={() => setTaskOpen(false)} />}
          <div className="card-h" style={{ marginTop: 22 }}><h3>Evidence</h3></div>
          <EvidenceItems items={evidence.filter((e) => e.objectiveId === ex.id)} />
          {!evidence.some((e) => e.objectiveId === ex.id) && <Empty>No evidence yet.</Empty>}
          <div className="row" style={{ marginTop: 8 }}><input placeholder="Add a result, link or number" value={proof} onChange={(x) => setProof(x.target.value)} /><button className="btn small" disabled={!proof.trim()} onClick={async () => { await commit({ put: { evidence: [{ id: uid(), objectiveId: ex.id, krId: null, occId: null, kind: /^https?:/.test(proof) ? "link" : "note", text: proof.trim(), createdAt: Date.now() }] } }); setProof(""); }}>Add</button></div>
          <div className="row" style={{ marginTop: 8 }}><AttachButton label="Attach a file" onFile={(f) => addFile(f, { objectiveId: ex.id, occId: null })} /><span className="small muted">Stored on this device only. Up to {fmtSize(10 * 1024 * 1024)} each.</span></div>
          {childLevel(ex.level) && (
            <div className="card" style={{ background: "var(--bg)", marginTop: 22 }}>
              <div className="card-h"><h3>AI help</h3></div>
              {aiOk && aiOk !== "checking" ? <p className="small muted">{aiOk} <a href="#/settings" onClick={onClose}>Open Settings</a></p> : <>
                <p className="small muted">Suggests sub-objectives and first tasks. Only this objective's title, why and dates are sent. You approve each one; nothing existing is changed.</p>
                <button className="btn small" disabled={aiBusy || aiOk === "checking"} onClick={async () => { setAiBusy(true); setAiErr(""); setAiRun(null); try { setAiRun(await runAi(buildBreakdownRequest(ex, objectives.filter((c) => c.parentId === ex.id)))); } catch (e) { setAiErr((e as Error).message); } setAiBusy(false); }}>{aiBusy ? "Thinking…" : "Break this down with AI"}</button></>}
              {aiErr && <p className="small" style={{ color: "var(--warn)" }} role="alert">{aiErr} Nothing was changed.</p>}
              {aiRun && <AiResult run={aiRun} onDone={() => setAiRun(null)} />}
            </div>
          )}
          {childLevel(ex.level) && <p style={{ marginTop: 14 }}><span className="muted small">Or add the next level yourself with ＋ beside this objective on the Vision screen.</span></p>}
        </>
      )}
    </Sheet>
  );
}
function KrRow({ kr, points }: { kr: KeyResult; points: KrPoint[] }) {
  const { commit, today, notify } = useApp(); const cur = latestValue(kr, points); const fr = krFraction(kr, cur); const [v, setV] = useState(""); const [open, setOpen] = useState(false);
  const fmt = (n: number) => `${kr.type === "currency" ? kr.currency + " " : ""}${n.toLocaleString()}${kr.type === "percent" ? "%" : kr.unit ? " " + kr.unit : ""}`;
  return (
    <div style={{ margin: "10px 0 14px" }}>
      <div className="row"><b className="grow small">{kr.title}</b><span className="small num">{kr.type === "binary" ? (cur >= 1 ? "Yes" : "Not yet") : `${fmt(cur)} → ${fmt(kr.target)}`}</span></div>
      <Bar frac={fr} tone={fr !== null && fr >= 1 ? "" : "sand"} />
      <div className="row small muted" style={{ marginTop: 4 }}><span className="grow">{kr.direction === "down" ? "Lower is better" : "Higher is better"} · from {fmt(kr.baseline)}</span><button className="btn ghost small" onClick={() => setOpen(!open)}>{open ? "Close" : "Record a measurement"}</button></div>
      {open && <div className="row"><input inputMode="decimal" placeholder={kr.type === "binary" ? "1 = achieved" : "New value"} value={v} onChange={(x) => setV(x.target.value)} /><button className="btn small primary" disabled={!Number.isFinite(Number(v)) || v === ""} onClick={async () => { const p: KrPoint = { id: uid(), krId: kr.id, date: today, value: Number(v), note: "", createdAt: Date.now() }; await commit({ put: { krPoints: [p] } }); setV(""); setOpen(false); notify("Measurement recorded"); }}>Save</button></div>}
    </div>
  );
}
function KrForm({ objectiveId, onDone }: { objectiveId: string; onDone: () => void }) {
  const { commit } = useApp(); const [f, setF] = useState({ title: "", type: "numeric" as KrType, direction: "up" as "up" | "down", baseline: "0", target: "", unit: "" });
  const b = Number(f.baseline), t = Number(f.target); const span = f.direction === "up" ? t - b : b - t;
  const err = !f.title.trim() ? "Name the result" : f.type === "binary" ? "" : f.target === "" || !Number.isFinite(t) || !Number.isFinite(b) ? "Baseline and target must be numbers" : span <= 0 ? `The target must be ${f.direction === "up" ? "above" : "below"} the baseline` : "";
  return (
    <div className="card" style={{ background: "var(--bg)" }}>
      <Field label="Key result"><input value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} placeholder="e.g. Monthly revenue" /></Field>
      <div className="row2"><Field label="Type"><select value={f.type} onChange={(x) => setF({ ...f, type: x.target.value as KrType })}>{["numeric", "percent", "currency", "count", "binary"].map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Better when"><select value={f.direction} onChange={(x) => setF({ ...f, direction: x.target.value as "up" | "down" })}><option value="up">Higher</option><option value="down">Lower</option></select></Field></div>
      {f.type !== "binary" && <div className="row3"><Field label="Baseline"><input inputMode="decimal" value={f.baseline} onChange={(x) => setF({ ...f, baseline: x.target.value })} /></Field><Field label="Target"><input inputMode="decimal" value={f.target} onChange={(x) => setF({ ...f, target: x.target.value })} /></Field><Field label="Unit"><input value={f.unit} onChange={(x) => setF({ ...f, unit: x.target.value })} /></Field></div>}
      {err && f.title.trim() && <p className="small" style={{ color: "var(--warn)" }}>{err}</p>}
      <div className="row"><button className="btn primary small" disabled={!!err} onClick={async () => { await commit({ put: { krs: [{ id: uid(), objectiveId, title: f.title.trim(), type: f.type, direction: f.direction, baseline: f.type === "binary" ? 0 : b, target: f.type === "binary" ? 1 : t, unit: f.unit, currency: f.type === "currency" ? "EUR" : "", createdAt: Date.now() }] } }); onDone(); }}>Add key result</button><button className="btn ghost small" onClick={onDone}>Cancel</button></div>
    </div>
  );
}

// ---------------- plan: proposals the user approves ----------------
export function PlanSheet({ from, to, title, onClose }: { from: DateStr; to: DateStr; title: string; onClose: () => void }) {
  const { propose, approve, tasks, occurrences, notify } = useApp();
  const plan = useMemo(() => propose(from, to), [propose, from, to]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const name = (occId: string) => tasks.find((t) => t.id === occurrences.find((o) => o.id === occId)?.taskId)?.title ?? "Task";
  const days = [...new Set(plan.placements.map((p) => p.date))].sort(); const chosen = plan.placements.filter((p) => !off.has(p.occId));
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted small">LifeOS proposes times around your calendar and rules. Nothing is scheduled until you approve it.</p>
      {plan.placements.length === 0 && plan.unplaced.length === 0 && <Empty>Everything in this period already has a time, or there is nothing to plan.</Empty>}
      {days.map((d) => (
        <div key={d} style={{ margin: "14px 0" }}><h3>{formatDate(d, { weekday: "long", day: "numeric", month: "short" })}</h3>
          {plan.placements.filter((p) => p.date === d).sort((a, b) => a.startMin - b.startMin).map((p) => (
            <label key={p.occId} className="row" style={{ padding: "8px 0" }}><input type="checkbox" checked={!off.has(p.occId)} onChange={() => setOff((s) => { const n = new Set(s); n.has(p.occId) ? n.delete(p.occId) : n.add(p.occId); return n; })} />
              <span className="grow"><b className="small">{name(p.occId)}</b><span className="small muted"> · {minToHM(p.startMin)}–{minToHM(p.endMin)}</span><br /><span className="small muted">Why: {p.why}</span></span></label>
          ))}
        </div>
      ))}
      {plan.unplaced.length > 0 && <div className="insight attention"><b>Could not be placed</b>{plan.unplaced.map((u) => <p key={u.occId} className="small">{name(u.occId)}: {u.reason}</p>)}<p className="small muted">LifeOS will not break your rules to fit them in. Change the task, free some time, or adjust your rules yourself.</p></div>}
      <button className="btn primary block" disabled={!chosen.length} onClick={async () => { await approve(chosen, "Approved plan"); notify(`${chosen.length} session${chosen.length === 1 ? "" : "s"} scheduled`); onClose(); }}>Approve {chosen.length} session{chosen.length === 1 ? "" : "s"}</button>
    </Sheet>
  );
}

// ---------------- reviews ----------------
export function ReviewSheet({ period, periodStart, to, onClose }: { period: Review["period"]; periodStart: DateStr; to: DateStr; onClose: () => void }) {
  const { occurrences, tasks, executions, objectives, krs, krPoints, commit, today, notify, reviews } = useApp();
  const s = executionStats(occurrences, tasks, executions, periodStart, to, today);
  const active = objectives.filter((o) => o.status === "active" && (o.level === "quarterly" || o.level === "annual" || o.level === "monthly" || o.level === "weekly"));
  const prior = reviews.find((r) => r.period === period && r.periodStart === periodStart);
  const [f, setF] = useState({ wins: prior?.wins ?? "", misses: prior?.misses ?? "", lessons: prior?.lessons ?? "", adjustments: prior?.adjustments ?? "" });
  return (
    <Sheet title={`${period[0]!.toUpperCase() + period.slice(1)} review`} onClose={onClose}>
      <p className="muted small">{formatDate(periodStart)} – {formatDate(to)}. Compare what you committed to with what actually happened.</p>
      <div className="row3" style={{ margin: "12px 0" }}><div className="stat"><b>{s.done}</b><span>done</span></div><div className="stat"><b>{s.partial + s.skipped}</b><span>partial / skipped</span></div><div className="stat"><b>{s.missed}</b><span>missed</span></div></div>
      <p className="small">Planned time {formatMinutes(s.plannedMin)} · actual {formatMinutes(s.actualMin)}</p>
      {active.slice(0, 5).map((o) => { const oc = objectiveOutcome(o, objectives, krs, krPoints); return <p key={o.id} className="small">{o.title}: {oc.fraction === null ? "not measured" : Math.round(oc.fraction * 100) + "% of the result"} <span className="muted">({pace(o, oc, today)})</span></p>; })}
      <div style={{ height: 8 }} />
      <Field label="What went well?"><textarea rows={2} value={f.wins} onChange={(x) => setF({ ...f, wins: x.target.value })} /></Field>
      <Field label="What did not go as planned, and why?"><textarea rows={2} value={f.misses} onChange={(x) => setF({ ...f, misses: x.target.value })} /></Field>
      <Field label="What did you learn?"><textarea rows={2} value={f.lessons} onChange={(x) => setF({ ...f, lessons: x.target.value })} /></Field>
      <Field label="What will you change next?"><textarea rows={2} value={f.adjustments} onChange={(x) => setF({ ...f, adjustments: x.target.value })} /></Field>
      <button className="btn primary block" onClick={async () => { await commit({ put: { reviews: [{ id: prior?.id ?? uid(), period, periodStart, ...f, snapshot: { done: s.done, partial: s.partial, skipped: s.skipped, missed: s.missed, plannedMin: s.plannedMin, actualMin: s.actualMin }, createdAt: Date.now() }] } }); notify("Review saved"); onClose(); }}>Save review</button>
    </Sheet>
  );
}

// ---------------- commitments ----------------
export function CommitmentSheet({ date, commitment, onClose }: { date: DateStr; commitment?: Commitment; onClose: () => void }) {
  const { commit, notify, sessions, occurrences } = useApp(); const c0 = commitment;
  const [f, setF] = useState({ title: c0?.title ?? "", date: c0?.date ?? date, start: c0 ? minToHM(c0.startMin) : "09:00", end: c0 ? minToHM(c0.endMin) : "10:00", protectedBlock: c0?.protectedBlock ?? false });
  const readOnlyTime = c0?.source === "ics"; const bad = !f.title.trim() || hmToMin(f.end) <= hmToMin(f.start) || !isDateStr(f.date);
  return (
    <Sheet title={c0 ? (readOnlyTime ? "Imported event" : "Edit commitment") : "Fixed commitment"} onClose={onClose}>
      <p className="muted small">{readOnlyTime ? "Imported from a calendar file. You can remove it here; to change it, change it in your calendar and import again." : "Appointments and protected time. LifeOS plans around them and never moves them."}</p>
      <Field label="What"><input value={f.title} onChange={(x) => setF({ ...f, title: x.target.value })} disabled={readOnlyTime} /></Field>
      <Field label="Date"><input type="date" value={f.date} onChange={(x) => setF({ ...f, date: x.target.value })} disabled={readOnlyTime} /></Field>
      <div className="row2"><Field label="From"><input type="time" value={f.start} onChange={(x) => setF({ ...f, start: x.target.value })} disabled={readOnlyTime} /></Field><Field label="To" error={hmToMin(f.end) <= hmToMin(f.start) ? "Must be after the start" : ""}><input type="time" value={f.end} onChange={(x) => setF({ ...f, end: x.target.value })} disabled={readOnlyTime} /></Field></div>
      {!readOnlyTime && <label className="row"><input type="checkbox" checked={f.protectedBlock} onChange={(x) => setF({ ...f, protectedBlock: x.target.checked })} /> <span className="small">Protected focus time</span></label>}
      {!readOnlyTime && <button className="btn primary block" disabled={bad} onClick={async () => {
        const c: Commitment = { id: c0?.id ?? uid(), title: f.title.trim(), date: f.date, startMin: hmToMin(f.start), endMin: hmToMin(f.end), source: "manual", externalId: null, protectedBlock: f.protectedBlock, createdAt: c0?.createdAt ?? Date.now() };
        await commit({ put: { commitments: [c] } });
        const live = new Set(occurrences.filter((o) => o.status === "planned" || o.status === "in-progress").map((o) => o.id)); const hit = sessionConflicts(sessions, [c], live).length;
        notify(hit ? `Saved. It overlaps ${hit} scheduled task${hit === 1 ? "" : "s"}: see the warning in the Planner.` : c0 ? "Commitment updated" : "Commitment added"); onClose();
      }}>{c0 ? "Save changes" : "Add"}</button>}
      {c0 && <button className="btn danger block" onClick={async () => { if (confirm(`Remove “${c0.title}”?`)) { await commit({ del: { commitments: [c0.id] } }); notify("Removed"); onClose(); } }}>Remove</button>}
    </Sheet>
  );
}
export { LEVELS, range, weekdayIndex };
