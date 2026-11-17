import { useState } from "react";
import { useApp } from "../store";
import { Card, Page, Meter, Sheet, Field, ActivitySelect, Empty } from "../ui/kit";
import { badges, goalProgress, personalRecords } from "../lib/goals";
import { ACTIVITY_LABEL, uid, type Activity, type Goal, type GoalKind } from "../lib/model";
import { formatDate, formatMinutes } from "../lib/dates";

const KINDS: { v: GoalKind; t: string; unit: string }[] = [
  { v: "minutes", t: "Hours of practice", unit: "hours" }, { v: "sessions", t: "Number of sessions", unit: "sessions" },
  { v: "streak", t: "Consecutive days", unit: "days" }, { v: "vocab", t: "Words & expressions saved", unit: "items" },
  { v: "counter", t: "Count it myself (e.g. articles read)", unit: "times" },
];

export function Goals() {
  const { goals, sessions, vocab, challenges, settings, today, ledger, saveGoal, deleteGoal, notify } = useApp();
  const [edit, setEdit] = useState<Goal | null>(null);
  const bs = badges(sessions, vocab, challenges, settings.targetHistory, today);
  const rec = personalRecords(ledger, today);
  const earned = bs.filter((b) => b.earnedOn), todo = bs.filter((b) => !b.earnedOn);
  const active = goals.filter((g) => !g.completedAt), done = goals.filter((g) => g.completedAt);

  const row = (g: Goal) => { const p = goalProgress(g, sessions, vocab, today); return (
    <li key={g.id} className="goal">
      <div className="sess"><b className="grow">{g.title}</b>{g.completedAt && <span className="pill done">Reached {formatDate(g.completedAt, { day: "numeric", month: "short" })}</span>}
        <button className="link" onClick={() => setEdit(g)}>Edit</button></div>
      <Meter value={p.current} max={p.target} tone={p.done ? "done" : undefined} /><small className="muted">{p.label} · {p.pct}%</small>
      {g.kind === "counter" && !g.completedAt && <button className="btn small" onClick={() => saveGoal({ ...g, manualCount: g.manualCount + 1 })}>＋1</button>}
    </li>); };

  return (
    <Page title="Goals & badges" back="#/more" right={<button className="btn small" onClick={() => setEdit({ id: "", title: "", kind: "minutes", activity: "listening", target: 1200, startDate: today, manualCount: 0, vocabStatus: "any", createdAt: Date.now() })}>＋ New</button>}>
      <Card title="Active goals">{active.length ? <ul className="rows col">{active.map(row)}</ul> : <Empty>No active goals. Try “20 hours of listening” or “30 consecutive days of speaking”.</Empty>}</Card>
      {done.length > 0 && <Card title="Reached"><ul className="rows col">{done.map(row)}</ul></Card>}

      <Card title="Personal records">
        <ul className="plain">
          <li>Longest streak: <b>{rec.longestStreak} day{rec.longestStreak === 1 ? "" : "s"}</b></li>
          {rec.bestDay && <li>Best day: <b>{formatMinutes(rec.bestDay.minutes)}</b> on {formatDate(rec.bestDay.date)}</li>}
          {rec.bestWeek && <li>Best week: <b>{formatMinutes(rec.bestWeek.minutes)}</b> (week of {formatDate(rec.bestWeek.from)})</li>}
          {rec.mostSessionsDay && <li>Most sessions in a day: <b>{rec.mostSessionsDay.n}</b> on {formatDate(rec.mostSessionsDay.date)}</li>}
          {!rec.bestDay && <li className="muted">Records appear once you log sessions.</li>}
        </ul>
      </Card>
      <Card title="Badges earned">
        <p className="muted">Badges are earned from sustained practice in your records, not for single taps.</p>
        {earned.length ? <ul className="badges">{earned.map((b) => <li key={b.id} className="badge on"><b>{b.title}</b><small>{b.description}</small><small>{formatDate(b.earnedOn!, { day: "numeric", month: "short", year: "numeric" })}</small></li>)}</ul> : <Empty>None yet.</Empty>}
      </Card>
      <Card title="Still to earn"><ul className="badges">{todo.map((b) => <li key={b.id} className="badge"><b>{b.title}</b><small>{b.description}</small><small>{b.progress}</small></li>)}</ul></Card>

      {edit && <GoalSheet goal={edit} onClose={() => setEdit(null)} onSave={async (g) => { await saveGoal(g); notify("Goal saved"); setEdit(null); }} onDelete={edit.id ? async () => { if (confirm("Delete this goal? Your sessions are not affected.")) { await deleteGoal(edit.id); setEdit(null); } } : undefined} />}
    </Page>
  );
}

function GoalSheet({ goal, onSave, onClose, onDelete }: { goal: Goal; onSave: (g: Goal) => void; onClose: () => void; onDelete?: (() => void) | undefined }) {
  const isNew = !goal.id;
  const [g, setG] = useState(goal);
  const [t, setT] = useState(String(g.kind === "minutes" ? g.target / 60 : g.target));
  const kind = KINDS.find((k) => k.v === g.kind)!;
  const n = Number(t);
  const ok = g.title.trim() && Number.isFinite(n) && n > 0;
  const needsAct = g.kind === "minutes" || g.kind === "sessions" || g.kind === "streak";
  return (
    <Sheet title={isNew ? "New goal" : "Edit goal"} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ ...g, id: g.id || uid(), title: g.title.trim(), target: g.kind === "minutes" ? Math.round(n * 60) : Math.round(n), createdAt: g.createdAt }); }}>
        <Field label="Goal"><input value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="e.g. 20 hours of listening" /></Field>
        <Field label="Measure"><select value={g.kind} disabled={!isNew} onChange={(e) => setG({ ...g, kind: e.target.value as GoalKind })}>{KINDS.map((k) => <option key={k.v} value={k.v}>{k.t}</option>)}</select></Field>
        {needsAct && <Field label="Activity"><select value={g.activity} onChange={(e) => setG({ ...g, activity: e.target.value as Activity | "any" })}><option value="any">Any activity</option>{(Object.keys(ACTIVITY_LABEL) as Activity[]).map((a) => <option key={a} value={a}>{ACTIVITY_LABEL[a]}</option>)}</select></Field>}
        {g.kind === "vocab" && <Field label="Count"><select value={g.vocabStatus} onChange={(e) => setG({ ...g, vocabStatus: e.target.value as Goal["vocabStatus"] })}><option value="any">All saved</option><option value="learned">Only marked learned</option></select></Field>}
        <div className="row2"><Field label={`Target (${kind.unit})`}><input inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} /></Field>
          <Field label="Counting from"><input type="date" value={g.startDate} onChange={(e) => setG({ ...g, startDate: e.target.value })} /></Field></div>
        {g.kind === "counter" && <Field label="Done so far"><input inputMode="numeric" value={g.manualCount} onChange={(e) => setG({ ...g, manualCount: Number(e.target.value.replace(/\D/g, "")) })} /></Field>}
        <button className="btn primary block" disabled={!ok}>Save</button>
        {onDelete && <button type="button" className="btn danger block" onClick={onDelete}>Delete goal</button>}
      </form>
    </Sheet>
  );
}
export { ActivitySelect };
