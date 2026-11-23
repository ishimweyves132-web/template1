import { useState } from "react";
import { useApp } from "../store";
import { Bar, Card, Empty, PageHead, Ring } from "../ui/kit";
import { ReviewSheet } from "./sheets";
import { addDays, formatDate, formatMinutes, weekStart, type DateStr } from "../lib/dates";
import { evidenceGaps, executionStats, habitStats, weightedSummary } from "../domain/evaluation";
import { elapsedFraction, objectiveOutcome, pace } from "../domain/progress";
import type { Review } from "../lib/model";

export function Progress() {
  const { today, occurrences, tasks, executions, habits, habitLogs, objectives, krs, krPoints, evidence, reviews, changes } = useApp();
  const [rev, setRev] = useState<{ period: Review["period"]; from: DateStr; to: DateStr } | null>(null);
  const ws = weekStart(today); const week = executionStats(occurrences, tasks, executions, ws, addDays(ws, 6), today); const prevWs = addDays(ws, -7); const prev = executionStats(occurrences, tasks, executions, prevWs, addDays(prevWs, 6), today);
  const hb = habitStats(habits, habitLogs, addDays(today, -27), today, today); const habitRate = hb.filter((h) => h.rate !== null); const avgHabit = habitRate.length ? habitRate.reduce((a, h) => a + h.rate!, 0) / habitRate.length : null;
  const active = objectives.filter((o) => o.status === "active"); const rows = active.map((o) => { const oc = objectiveOutcome(o, objectives, krs, krPoints); return { o, oc, p: pace(o, oc, today), el: elapsedFraction(o, today) }; });
  const measured = rows.filter((r) => r.oc.fraction !== null); const outcomeAvg = measured.length ? measured.reduce((a, r) => a + r.oc.fraction!, 0) / measured.length : null;
  const gaps = evidenceGaps(objectives, evidence); const required = objectives.filter((o) => o.evidenceRequired && (o.status === "active" || o.status === "completed")); const evRate = required.length ? (required.length - gaps.length) / required.length : null;
  const combined = weightedSummary([{ name: "Execution", value: week.doneRate, weight: 3 }, { name: "Consistency", value: avgHabit, weight: 2 }, { name: "Outcome", value: outcomeAvg, weight: 4 }, { name: "Evidence", value: evRate, weight: 1 }]);
  const pct = (x: number | null) => (x === null ? "–" : Math.round(x * 100) + "%");
  const ledger = [
    ...reviews.map((r) => ({ at: r.createdAt, t: `${r.period[0]!.toUpperCase() + r.period.slice(1)} review`, d: r.adjustments || r.lessons || r.wins || "Saved", k: "review" })),
    ...objectives.filter((o) => o.status === "completed" || o.status === "partial").map((o) => ({ at: o.updatedAt, t: o.status === "completed" ? `Achieved: ${o.title}` : `Partly achieved: ${o.title}`, d: o.completionCriteria, k: "goal" })),
    ...Object.values(changes.filter((c) => !c.undone).reduce<Record<string, { at: number; auto: boolean; kind: string; n: number; reason: string }>>((acc, c) => { const k = `${c.createdAt}|${c.kind}|${c.auto}`; acc[k] = acc[k] ? { ...acc[k]!, n: acc[k]!.n + 1 } : { at: c.createdAt, auto: c.auto, kind: c.kind, n: 1, reason: c.reason }; return acc; }, {}))
      .map((g) => ({ at: g.at, t: g.auto ? `${g.n} task${g.n === 1 ? "" : "s"} moved automatically` : g.kind === "schedule" ? `${g.n} session${g.n === 1 ? "" : "s"} scheduled` : `${g.n} task${g.n === 1 ? "" : "s"} rescheduled`, d: g.auto ? g.reason : "", k: "change" })),
    ...krPoints.map((p) => { const k = krs.find((x) => x.id === p.krId); return { at: p.createdAt, t: `Measured: ${k?.title ?? "result"} = ${p.value}`, d: "", k: "measure" }; }),
  ].sort((a, b) => b.at - a.at).slice(0, 14);
  return (
    <div>
      <PageHead title="Progress" sub="Four separate questions. Doing the work is not the same as getting the result." right={<div className="row wrap"><button className="btn" onClick={() => setRev({ period: "weekly", from: ws, to: addDays(ws, 6) })}>Weekly review</button></div>} />
      <div className="cols">
        <div>
          <Card title="Execution · did I do the work?">
            <div className="row" style={{ gap: 18 }}><Ring frac={week.doneRate} label={pct(week.doneRate)} sub="done" size={96} />
              <div className="grow"><div className="row3"><div className="stat"><b>{week.done}</b><span>done</span></div><div className="stat"><b>{week.partial + week.skipped}</b><span>partial / skipped</span></div><div className="stat"><b>{week.missed}</b><span>missed</span></div></div></div></div>
            <p className="small muted" style={{ marginTop: 10 }}>This week: planned {formatMinutes(week.plannedMin)}, actual {formatMinutes(week.actualMin)}.{prev.doneRate !== null && week.doneRate !== null ? ` Last week ${pct(prev.doneRate)} done.` : ""}{week.resolved === 0 ? " Nothing resolved yet this week." : ""}</p>
          </Card>
          <Card title="Consistency · did I keep the habit?">
            {hb.length === 0 ? <Empty>Add habits from the example plan or the Today screen to see consistency here.</Empty> : <ul className="list">{hb.map((h) => <li key={h.habit.id}><div className="row"><span className="grow small"><b>{h.habit.title}</b><span className="muted"> · {h.done} of {h.due} days</span></span><span className="small num">{h.streak > 0 ? `${h.streak} in a row` : ""}</span></div><Bar frac={h.rate} /></li>)}</ul>}
          </Card>
          <Card title="Evidence · can I show it?">
            {required.length === 0 ? <Empty>No objective requires evidence. Turn it on for goals where proof matters.</Empty> : gaps.length === 0 ? <p>Every objective that requires evidence has some.</p> : <><p className="small">{gaps.length} of {required.length} objectives still need evidence:</p>{gaps.map((g) => <p key={g.objective.id} className="small">• {g.objective.title}</p>)}</>}
            <p className="small muted">{evidence.length} piece{evidence.length === 1 ? "" : "s"} of evidence stored.</p>
          </Card>
        </div>
        <div>
          <Card title="Outcomes · did I get the result?">
            {rows.length === 0 ? <Empty>No active objectives yet.</Empty> : <ul className="list">{rows.sort((a, b) => (a.oc.fraction ?? -1) - (b.oc.fraction ?? -1)).map((r) => <li key={r.o.id}><div className="row"><b className="small grow">{r.o.title}</b><span className="small num">{pct(r.oc.fraction)}</span></div><Bar frac={r.oc.fraction} tone="sand" /><div className="small muted">{r.oc.fraction === null ? "Not measured: add a key result" : `time used ${Math.round(r.el * 100)}% · ${r.p.replace("-", " ")}`}</div></li>)}</ul>}
          </Card>
          <Card title="Combined view (optional)">
            <p className="small muted">A single number hides more than it shows, so the four scores above stay primary. If you want one, here is exactly how it is made:</p>
            <p className="big">{combined.value === null ? "Not enough measured data" : pct(combined.value)}</p>
            <p className="small muted">{combined.parts.map((p) => `${p.name} ${pct(p.value)} × ${p.weight}`).join(" · ") || "Nothing measured yet."}</p>
          </Card>
          <Card title="Reviews" action={<button className="btn small" onClick={() => setRev({ period: "monthly", from: addDays(today, -29), to: today })}>Monthly</button>}>
            {reviews.length === 0 ? <Empty>No reviews yet. A weekly review is where the plan gets corrected.</Empty> : <ul className="list">{[...reviews].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((r) => <li key={r.id}><b className="small">{r.period} · {formatDate(r.periodStart, { day: "numeric", month: "short" })}</b><div className="small muted">{r.adjustments || r.lessons || r.wins}</div></li>)}</ul>}
          </Card>
        </div>
      </div>
      <Card title="The Life Ledger">
        <p className="small muted">What you intended, what you did, the decisions you made and what changed: a record over the years.</p>
        {ledger.length === 0 ? <Empty>Your history will appear here as you plan, measure and review.</Empty> : <div className="ledger">{ledger.map((x, i) => <div key={i}><b className="small">{x.t}</b><div className="small muted">{formatDate(new Date(x.at).toISOString().slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}{x.d ? ` · ${x.d}` : ""}</div></div>)}</div>}
      </Card>
      {rev && <ReviewSheet period={rev.period} periodStart={rev.from} to={rev.to} onClose={() => setRev(null)} />}
    </div>
  );
}
