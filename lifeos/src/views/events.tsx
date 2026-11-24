import { useState } from "react";
import { useApp } from "../store";
import { Field, Sheet } from "../ui/kit";
import { formatDate, hmToMin, minToHM, isDateStr } from "../lib/dates";
import { violation } from "../domain/scheduler";
import { unscheduleSession } from "../domain/ops";
import { shortTrail } from "./sheets";

/** Move or unschedule one planned session. A manual move is held to exactly the same rules as the scheduler and the AI. */
export function SessionSheet({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { sessions, occurrences, tasks, objectives, context, approve, commit, notify } = useApp();
  const s = sessions.find((x) => x.id === sessionId); const occ = occurrences.find((o) => o.id === s?.occId); const task = tasks.find((t) => t.id === occ?.taskId);
  const [date, setDate] = useState(s?.date ?? ""); const [start, setStart] = useState(s ? minToHM(s.startMin) : "09:00"); const [dur, setDur] = useState(String(s ? s.endMin - s.startMin : 30));
  if (!s || !occ || !task) return null;
  const d = Number(dur); const endMin = hmToMin(start) + d;
  const why = !isDateStr(date) ? "Pick a valid date." : !Number.isInteger(d) || d < task.estimateMin ? `The session must be at least the task's estimate (${task.estimateMin} min).` : violation({ date, startMin: hmToMin(start), endMin }, task, context([], occ.id));
  const same = date === s.date && hmToMin(start) === s.startMin && endMin === s.endMin;
  return (
    <Sheet title={task.title} onClose={onClose}>
      <p className="crumb">{shortTrail(objectives.find((o) => o.id === task.objectiveId), objectives) || "Independent task"}</p>
      <p className="small muted">Now: {formatDate(s.date, { weekday: "long", day: "numeric", month: "short" })}, {minToHM(s.startMin)}–{minToHM(s.endMin)}</p>
      <Field label="Day"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="row2"><Field label="Starts"><input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field><Field label="Minutes"><input inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value.replace(/\D/g, ""))} /></Field></div>
      {!same && why && <p className="small" style={{ color: "var(--warn)" }} role="alert">Can't move there: {why}</p>}
      <button className="btn primary block" disabled={same || !!why} onClick={async () => { await approve([{ occId: occ.id, taskId: task.id, date, startMin: hmToMin(start), endMin, why: "moved by you" }], "Moved by you"); notify("Moved"); onClose(); }}>Move</button>
      <button className="btn block" onClick={async () => { const u = unscheduleSession(s, task.id, "Removed from the plan by you"); await commit({ put: { sessions: u.sessions, changes: u.changes } }); notify("Unscheduled. The task is still on its day."); onClose(); }}>Unschedule</button>
    </Sheet>
  );
}
