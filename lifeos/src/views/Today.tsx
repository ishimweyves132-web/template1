import { useEffect, useState } from "react";
import { useApp } from "../store";
import { Card, Check, Empty, PageHead, Ring } from "../ui/kit";
import { CompleteSheet, ReviewSheet, TaskSheet, PlanSheet, shortTrail } from "./sheets";
import { addDays, formatDate, formatMinutes, minToHM, nowMin } from "../lib/dates";
import { habitDueToday, habitStats } from "../domain/evaluation";
import { uid, type Occurrence, type Task } from "../lib/model";
import { missingOccurrences } from "../domain/ops";
import type { Recovery } from "../domain/reschedule";

const greeting = (d = new Date()) => (d.getHours() < 12 ? "Good morning" : d.getHours() < 18 ? "Good afternoon" : "Good evening");
function Clock({ since }: { since: number }) { const [, t] = useState(0); useEffect(() => { const i = setInterval(() => t((n) => n + 1), 1000); return () => clearInterval(i); }, []); const s = Math.floor((Date.now() - since) / 1000); return <span className="clock">{String(Math.floor(s / 3600)).padStart(2, "0")}:{String(Math.floor(s / 60) % 60).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>; }

export function Today() {
  const { today, occurrences, tasks, sessions, commitments, objectives, habits, habitLogs, toggleHabitOn, focus, startFocus, stopFocus, recover, commit, notify, reviews, loadDemo, vision, complete, executions } = useApp();
  const [done, setDone] = useState<{ occId: string; minutes?: number; startTs?: number } | null>(null); const [taskOpen, setTaskOpen] = useState(false); const [reviewOpen, setReviewOpen] = useState(false); const [planOpen, setPlanOpen] = useState(false);
  const [quick, setQuick] = useState(""); const [rec, setRec] = useState<Recovery | null>(null);
  const taskOf = (o: Occurrence): Task | undefined => tasks.find((t) => t.id === o.taskId);
  const todays = occurrences.filter((o) => o.date === today && o.status !== "cancelled" && taskOf(o));
  const open = todays.filter((o) => o.status === "planned" || o.status === "in-progress"); const resolved = todays.length - open.length;
  const top3 = [...open].sort((a, b) => taskOf(a)!.priority - taskOf(b)!.priority || (taskOf(a)!.deadline ?? "9999").localeCompare(taskOf(b)!.deadline ?? "9999")).slice(0, 3);
  const live = new Set(open.map((o) => o.id));
  const sess = sessions.filter((s) => s.date === today && s.state === "approved" && live.has(s.occId)).sort((a, b) => a.startMin - b.startMin);
  const cm = commitments.filter((c) => c.date === today);
  const timeline = [...sess.map((s) => ({ k: "s" as const, start: s.startMin, end: s.endMin, id: s.id, occ: s.occId })), ...cm.map((c) => ({ k: "c" as const, start: c.startMin, end: c.endMin, id: c.id, title: c.title }))].sort((a, b) => a.start - b.start);
  const unsched = open.filter((o) => !sess.some((s) => s.occId === o.id)); const missed = occurrences.filter((o) => o.status === "missed" && taskOf(o) && o.date >= addDays(today, -7)).sort((a, b) => b.date.localeCompare(a.date));
  const hs = habitStats(habits, habitLogs, today, today, today); const dueHabits = habits.filter((h) => !h.archived && habitDueToday(h, today));
  const trailOf = (t: Task) => shortTrail(objectives.find((o) => o.id === t.objectiveId), objectives);
  const n = nowMin(); const reviewedToday = reviews.some((r) => r.period === "daily" && r.periodStart === today);
  const fo = focus ? occurrences.find((o) => o.id === focus.occId) : null;

  const row = (o: Occurrence) => { const t = taskOf(o)!; const s = sess.find((x) => x.occId === o.id); const isFocus = focus?.occId === o.id; return (
    <li key={o.id}><div className="row">
      <Check state={o.status === "done" ? "done" : o.status === "partial" ? "partial" : "open"} label={`Complete ${t.title}`} onClick={() => setDone({ occId: o.id })} />
      <div className="grow"><b>{t.title}</b>{trailOf(t) && <div className="crumb">{trailOf(t)}</div>}<div className="small muted">{formatMinutes(t.estimateMin)}{s ? ` · ${minToHM(s.startMin)}–${minToHM(s.endMin)}` : ""}{t.deadline ? ` · due ${formatDate(t.deadline, { day: "numeric", month: "short" })}` : ""}</div></div>
      {!focus && <button className="btn small" aria-label={`Start focus on ${t.title}`} onClick={() => startFocus(o.id)}>▶ Focus</button>}{isFocus && <span className="pill sage">In focus</span>}
    </div></li>); };
  return (
    <div>
      <PageHead title={greeting()} sub={formatDate(today, { weekday: "long", day: "numeric", month: "long" })} right={<button className="btn small" onClick={() => setTaskOpen(true)}>＋ Task</button>} />
      {focus && fo && <div className="focusbar" role="timer"><div className="grow"><div className="small">Focus · {taskOf(fo)?.title}</div><Clock since={focus.startedAt} /></div><button className="btn" onClick={() => setDone({ occId: focus.occId, minutes: Math.max(1, Math.round((Date.now() - focus.startedAt) / 60000)), startTs: focus.startedAt })}>Finish</button><button className="btn" onClick={() => confirm("Stop the timer without recording?") && stopFocus()}>Discard</button></div>}
      {objectives.length === 0 && tasks.length === 0 && (
        <Card className="hero"><p className="big">Welcome to LifeOS.</p><p className="muted">Start by describing the life you want, then break it into measurable goals and daily actions. Or look around first with an example plan.</p>
          <div className="row wrap"><a className="btn primary" href="#/vision">Define your vision</a><button className="btn" onClick={loadDemo}>Load an example plan</button></div></Card>
      )}
      <div className="cols">
        <div>
          <Card title="Today">
            <div className="row" style={{ gap: 18 }}><Ring frac={todays.length ? resolved / todays.length : null} label={todays.length ? `${resolved}/${todays.length}` : "–"} sub="resolved" />
              <div className="grow">{todays.length === 0 ? <p className="muted">Nothing is planned for today.</p> : <><p className="big">{open.length === 0 ? "Everything for today is resolved." : `${open.length} to go today.`}</p><p className="small muted">{vision[0]?.statement ? `“${vision[0].statement}”` : "Every task shows the goal it serves."}</p></>}</div></div>
          </Card>
          <Card title="Your three priorities">
            {top3.length === 0 ? <Empty>No open priorities. Add a task or plan your day.</Empty> : <ul className="list">{top3.map(row)}</ul>}
          </Card>
          {unsched.filter((o) => !top3.includes(o)).length > 0 && <Card title="Also today"><ul className="list">{unsched.filter((o) => !top3.includes(o)).map(row)}</ul></Card>}
          {todays.length - open.length > 0 && <Card title="Done today"><ul className="list">{todays.filter((o) => !live.has(o.id)).map((o) => { const t = taskOf(o)!; const mins = executions.filter((e) => e.occId === o.id && e.date === today).reduce((a, e) => a + e.minutes, 0); return <li key={o.id}><div className="row"><Check state={o.status === "done" ? "done" : o.status === "partial" ? "partial" : "open"} label={`${t.title}: ${o.status}`} onClick={() => setDone({ occId: o.id })} /><div className="grow"><b className="small">{t.title}</b><div className="small muted">{o.status === "done" ? "Done" : o.status === "partial" ? "Partly done" : "Skipped"}{mins ? ` · ${formatMinutes(mins)} actual` : ""}</div></div></div></li>; })}</ul></Card>}
          <Card title="Quick add"><form className="row" onSubmit={async (e) => { e.preventDefault(); if (!quick.trim()) return; const t: Task = { id: uid(), title: quick.trim(), notes: "", objectiveId: null, priority: 3, estimateMin: 30, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: today, status: "active", createdAt: Date.now() }; await commit({ put: { tasks: [t], occurrences: missingOccurrences([t], occurrences, today, today) } }); setQuick(""); notify("Added to today. Link it to a goal from the task menu."); }}>
            <input aria-label="Quick add a task for today" placeholder="Add a task for today…" value={quick} onChange={(e) => setQuick(e.target.value)} /><button className="btn primary" disabled={!quick.trim()}>Add</button></form></Card>
        </div>
        <div>
          <Card title="Timeline" action={<button className="btn small" onClick={() => setPlanOpen(true)}>Plan my day</button>}>
            {timeline.length === 0 ? <Empty>No times set yet. “Plan my day” proposes times around your calendar for you to approve.</Empty> : timeline.map((x) => { const t = x.k === "s" ? taskOf(occurrences.find((o) => o.id === x.occ)!) : null; const isNow = n >= x.start && n < x.end;
              return <div key={x.id} className="tline"><div className="t num">{minToHM(x.start)}</div><div className={`sess ${isNow ? "now" : ""}`} style={x.k === "c" ? { borderColor: "var(--line-2)" } : undefined}><b className="small">{x.k === "s" ? t?.title : x.title}</b><div className="small muted">{minToHM(x.start)}–{minToHM(x.end)}{x.k === "c" ? " · calendar" : ""}{isNow ? " · now" : ""}</div></div></div>; })}
          </Card>
          {dueHabits.length > 0 && <Card title="Habits">{dueHabits.map((h) => { const on = habitLogs.some((l) => l.habitId === h.id && l.date === today); const st = hs.find((x) => x.habit.id === h.id); return <div key={h.id} className="row" style={{ padding: "6px 0" }}><Check state={on ? "done" : "open"} label={`${h.title} today`} onClick={() => toggleHabitOn(h.id, today)} /><span className="grow">{h.title}</span><span className="small muted">{st && st.streak > 0 ? `${st.streak} in a row` : ""}</span></div>; })}</Card>}
          {missed.length > 0 && <Card title="Missed">
            <ul className="list">{missed.slice(0, 5).map((o) => <li key={o.id}><div className="row"><div className="grow"><b className="small">{taskOf(o)!.title}</b><div className="small muted">{formatDate(o.date, { weekday: "short", day: "numeric", month: "short" })}{o.moves ? ` · moved ${o.moves}×` : ""}</div></div><button className="btn small" onClick={() => setDone({ occId: o.id })}>Done after all</button><button className="btn ghost small" onClick={() => complete(o.id, { outcome: "skipped", minutes: 0, reason: "let go" })}>Let go</button></div></li>)}</ul><p className="small muted">Showing the last 7 days. Older misses stay in your history.</p>
            <button className="btn block" onClick={async () => { const r = await recover(); setRec(r); notify(r.mutation.changes.length ? `${r.mutation.changes.length} rescheduled within your rules` : "Nothing could be moved automatically"); }}>Recover within my rules</button>
            {rec && rec.needsApproval.length > 0 && <div className="insight attention"><b>Needs your decision</b>{rec.needsApproval.map((n2) => <p key={n2.occId} className="small">{taskOf(occurrences.find((o) => o.id === n2.occId)!)?.title}: {n2.reason}</p>)}</div>}
          </Card>}
          <Card title="Evening"><p className="small muted">{reviewedToday ? "Today's review is saved." : "Close the day: what did you finish, what moved, what did you learn?"}</p><button className="btn block" onClick={() => setReviewOpen(true)}>{reviewedToday ? "Edit today's review" : "Review the day"}</button></Card>
        </div>
      </div>
      {done && <CompleteSheet {...done} onClose={() => setDone(null)} />}
      {taskOpen && <TaskSheet date={today} onClose={() => setTaskOpen(false)} />}
      {planOpen && <PlanSheet from={today} to={today} title="Plan my day" onClose={() => setPlanOpen(false)} />}
      {reviewOpen && <ReviewSheet period="daily" periodStart={today} to={today} onClose={() => setReviewOpen(false)} />}
      
    </div>
  );
}
