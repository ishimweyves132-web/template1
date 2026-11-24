import { useRef, useState } from "react";
import { useApp } from "../store";
import { Card, Empty, PageHead, Segmented } from "../ui/kit";
import { CommitmentSheet, PlanSheet } from "./sheets";
import { SessionSheet } from "./events";
import { sessionConflicts, unscheduleSession } from "../domain/ops";
import { addDays, addMonths, daysInMonth, formatDate, formatMinutes, minToHM, monthStart, nowMin, range, weekStart, weekdayIndex, type DateStr } from "../lib/dates";
import { exportIcs, parseIcs } from "../domain/ics";
import { downloadJson } from "../lib/backup";
import { uid, type Commitment } from "../lib/model";

type View = "day" | "week" | "month";
const H0 = 6, H1 = 22;
export function Planner() {
  const { today, sessions, commitments, occurrences, tasks, objectives, changes, undo, commit, notify } = useApp();
  const [view, setView] = useState<View>("day"); const [date, setDate] = useState<DateStr>(today); const [plan, setPlan] = useState<{ from: DateStr; to: DateStr; title: string } | null>(null); const [cm, setCm] = useState<{ edit?: Commitment } | null>(null); const [sess, setSess] = useState<string | null>(null); const file = useRef<HTMLInputElement>(null);
  const taskOf = (occId: string) => tasks.find((t) => t.id === occurrences.find((o) => o.id === occId)?.taskId);
  const live = new Set(occurrences.filter((o) => o.status === "planned" || o.status === "in-progress").map((o) => o.id));
  const sessOn = (d: DateStr) => sessions.filter((s) => s.date === d && s.state === "approved" && live.has(s.occId)).sort((a, b) => a.startMin - b.startMin);
  const cmOn = (d: DateStr) => commitments.filter((c) => c.date === d).sort((a, b) => a.startMin - b.startMin);
  const load = (d: DateStr) => sessOn(d).reduce((a, s) => a + s.endMin - s.startMin, 0);
  const step = view === "day" ? 1 : view === "week" ? 7 : 0; const nav = (n: number) => setDate(view === "month" ? addMonths(monthStart(date), n) : addDays(date, n * step));
  const conflicts = sessionConflicts(sessions, commitments, live); const bad = new Set(conflicts.map((c) => c.session.id));
  const fixConflicts = async () => { const u = conflicts.map((c) => unscheduleSession(c.session, taskOf(c.session.occId)?.id ?? "", `Overlapped “${c.with}”`)); await commit({ put: { sessions: u.flatMap((x) => x.sessions), changes: u.flatMap((x) => x.changes) } }); setPlan({ from: today, to: addDays(today, 6), title: "Re-plan around your commitments" }); };
  const ws = weekStart(date); const recent = [...changes].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  const importIcs = async (f: File | undefined) => {
    if (!f) return; const r = parseIcs(await f.text(), addDays(today, -1), addDays(today, 180)); const have = new Set(commitments.filter((c) => c.externalId).map((c) => c.externalId));
    const fresh: Commitment[] = r.events.filter((e) => !have.has(e.externalId)).map((e) => ({ id: uid(), title: e.title, date: e.date, startMin: e.startMin, endMin: e.endMin, source: "ics", externalId: e.externalId, protectedBlock: false, createdAt: Date.now() }));
    if (fresh.length) await commit({ put: { commitments: fresh } });
    notify(`${fresh.length} new event${fresh.length === 1 ? "" : "s"} imported${r.events.length - fresh.length ? `, ${r.events.length - fresh.length} already present` : ""}${r.skipped.length ? `. Skipped ${r.skipped.length}: ${r.skipped[0]}` : ""}`);
    if (file.current) file.current.value = "";
  };
  const exportPlan = () => {
    const items = sessions.filter((s) => s.state === "approved" && s.date >= today && live.has(s.occId)).map((s) => { const t = taskOf(s.occId); const o = objectives.find((x) => x.id === t?.objectiveId); return { sessionId: s.id, title: t?.title ?? "LifeOS task", date: s.date, startMin: s.startMin, endMin: s.endMin, description: o ? `Serves: ${o.title}` : "", revision: 0 }; });
    if (!items.length) { notify("Nothing is scheduled yet."); return; } downloadJson("lifeos-plan.ics", exportIcs(items), "text/calendar"); notify(`${items.length} sessions exported. Re-importing the file updates them instead of duplicating.`);
  };

  return (
    <div>
      <PageHead title="Planner" sub="Your time, your calendar, and what LifeOS proposes." right={<div className="row wrap"><button className="btn primary" onClick={() => setPlan({ from: view === "week" ? (ws < today ? today : ws) : today, to: view === "week" ? addDays(ws, 6) : addDays(today, 6), title: "Plan my week" })}>Plan my week</button></div>} />
      <div className="row wrap" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <Segmented label="Calendar view" value={view} onChange={setView} options={[{ v: "day", t: "Day" }, { v: "week", t: "Week" }, { v: "month", t: "Month" }]} />
        <div className="row"><button className="btn small" onClick={() => nav(-1)} aria-label="Previous">‹</button><b className="small" style={{ minWidth: 150, textAlign: "center" }}>{view === "month" ? formatDate(date, { month: "long", year: "numeric" }) : view === "week" ? `${formatDate(ws, { day: "numeric", month: "short" })} – ${formatDate(addDays(ws, 6), { day: "numeric", month: "short" })}` : formatDate(date, { weekday: "long", day: "numeric", month: "short" })}</b><button className="btn small" onClick={() => nav(1)} aria-label="Next">›</button><button className="btn ghost small" onClick={() => setDate(today)}>Today</button></div>
      </div>
      {conflicts.length > 0 && <Card className="warn-card"><b>{conflicts.length} scheduled task{conflicts.length === 1 ? " overlaps" : "s overlap"} a commitment</b><p className="small muted">{conflicts.slice(0, 3).map((c) => `${taskOf(c.session.occId)?.title} (${c.with})`).join(", ")}. LifeOS never moves your commitments.</p><button className="btn small" onClick={fixConflicts}>Unschedule and re-plan</button></Card>}
      <div className="cols">
        <Card>
          {view === "day" && <>
            <div className="day" style={{ ["--h" as string]: H1 - H0 } as React.CSSProperties} aria-label="Day timeline">
              {Array.from({ length: H1 - H0 + 1 }, (_, i) => <div key={i} className="hr" style={{ top: i * 52 }}><span className="num">{String(H0 + i).padStart(2, "0")}:00</span></div>)}
              {cmOn(date).map((c) => <button key={c.id} className="ev c" aria-label={`Edit ${c.title}`} onClick={() => setCm({ edit: c })} style={{ top: ((c.startMin / 60 - H0) * 52), height: Math.max(34, ((c.endMin - c.startMin) / 60) * 52 - 2) }}><b>{c.title}</b><span className="muted">{minToHM(c.startMin)}–{minToHM(c.endMin)}{c.source === "ics" ? " · imported" : ""}</span></button>)}
              {sessOn(date).map((s) => <button key={s.id} className={`ev s ${bad.has(s.id) ? "conflict" : ""}`} aria-label={`Move or unschedule ${taskOf(s.occId)?.title}`} onClick={() => setSess(s.id)} style={{ top: ((s.startMin / 60 - H0) * 52), height: Math.max(34, ((s.endMin - s.startMin) / 60) * 52 - 2) }}><b>{taskOf(s.occId)?.title}</b><span className="muted">{minToHM(s.startMin)}–{minToHM(s.endMin)}{bad.has(s.id) ? " · overlaps a commitment" : ""}</span></button>)}
              {date === today && nowMin() >= H0 * 60 && nowMin() <= H1 * 60 && <div className="nowline" style={{ top: (nowMin() / 60 - H0) * 52 }} aria-label="Now" />}
            </div>
            {sessOn(date).length + cmOn(date).length === 0 && <Empty>Nothing on this day. Use “Plan my week” to place your tasks.</Empty>}
          </>}
          {view === "week" && <div className="wk">{range(ws, addDays(ws, 6)).map((d) => <div key={d}><div className={`dn ${d === today ? "today" : ""}`}>{formatDate(d, { weekday: "short", day: "numeric" })}</div>{[...cmOn(d).map((c) => ({ k: "c", s: c.startMin, t: c.title, id: c.id })), ...sessOn(d).map((s) => ({ k: "s", s: s.startMin, t: taskOf(s.occId)?.title ?? "", id: s.id }))].sort((a, b) => a.s - b.s).map((x) => <button key={x.id} className={`it ${x.k}`} title={x.t} onClick={() => (x.k === "s" ? setSess(x.id) : setCm({ edit: commitments.find((c) => c.id === x.id)! }))}>{minToHM(x.s)} {x.t}</button>)}<div className="small muted">{load(d) ? formatMinutes(load(d)) : ""}</div></div>)}</div>}
          {view === "month" && (() => { const ms = monthStart(date); const lead = weekdayIndex(ms); return <div className="mo">{["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <span key={i} className="wd">{w}</span>)}{Array.from({ length: lead }, (_, i) => <span key={"e" + i} />)}{Array.from({ length: daysInMonth(ms) }, (_, i) => { const d = addDays(ms, i); const l = load(d); return <button key={d} className={`${d === today ? "today" : ""} ${d === date ? "sel" : ""}`} onClick={() => { setDate(d); setView("day"); }} aria-label={`${formatDate(d)}: ${l ? formatMinutes(l) + " planned" : "nothing planned"}`}><span>{i + 1}</span><small>{l ? Math.round(l / 6) / 10 + "h" : ""}</small></button>; })}</div>; })()}
        </Card>
        <div>
          <Card title="Calendar">
            <div className="row wrap"><button className="btn small" onClick={() => setCm({})}>＋ Commitment</button><button className="btn small" onClick={() => file.current?.click()}>Import .ics</button><button className="btn small" onClick={exportPlan}>Export plan</button></div>
            <input ref={file} type="file" accept=".ics,text/calendar" hidden onChange={(e) => void importIcs(e.target.files?.[0])} />
            <p className="small muted" style={{ marginTop: 10 }}>Import a calendar file exported from Google Calendar, Outlook or your phone. Events become busy time that LifeOS never moves. Exported sessions keep stable IDs, so re-importing updates instead of duplicating.</p>
          </Card>
          <Card title="Recent changes">
            {recent.length === 0 ? <Empty>Every scheduling decision is recorded here, and can be undone.</Empty> : <ul className="list">{recent.map((c) => <li key={c.id}><div className="row"><div className="grow"><b className="small">{taskOf(c.occId)?.title ?? "Task"}</b><div className="small muted">{c.auto ? "Moved automatically" : c.kind === "schedule" ? "Scheduled" : "Rescheduled"}{c.after ? ` · ${formatDate(c.after.date, { weekday: "short", day: "numeric", month: "short" })} ${minToHM(c.after.startMin)}` : ""}{c.auto ? ` · ${c.reason}` : ""}</div></div>{c.undone ? <span className="pill">Undone</span> : <button className="btn small" onClick={async () => { const r = await undo(c.id); notify(r ?? "Change undone"); }}>Undo</button>}</div></li>)}</ul>}
          </Card>
        </div>
      </div>
      {plan && <PlanSheet {...plan} onClose={() => setPlan(null)} />}{cm && <CommitmentSheet date={date} {...(cm.edit ? { commitment: cm.edit } : {})} onClose={() => setCm(null)} />}{sess && <SessionSheet sessionId={sess} onClose={() => setSess(null)} />}
    </div>
  );
}
