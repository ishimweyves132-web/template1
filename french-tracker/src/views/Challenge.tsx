import { useState } from "react";
import { useApp } from "../store";
import { Card, Page, Meter, Sheet, Field, Empty } from "../ui/kit";
import { BLOCKS, CHALLENGE_LENGTH, blockFor, challengeStatus, dayOf, scheduledDate } from "../lib/challenge";
import { formatDate } from "../lib/dates";

export function Challenge() {
  const { challenges, today, saveChallenge, startChallenge, notify } = useApp();
  const cur = challenges.find((c) => !c.archivedAt);
  const [open, setOpen] = useState<number | null>(null);
  const [startAt, setStartAt] = useState<string | null>(null);
  const archived = challenges.filter((c) => c.archivedAt);

  if (!cur) return (
    <Page title="30-day challenge" back="#/more">
      <Card><p>Thirty days of focused French in six five-day blocks, from introductions to debates. You tick off each day yourself; missed days never reset anything.</p>
        <ul className="plain">{BLOCKS.map((b) => <li key={b.from}><b>Days {b.from}–{b.to}</b> {b.title}</li>)}</ul>
        <button className="btn primary block" onClick={() => startChallenge(today)}>Start today</button></Card>
    </Page>
  );
  const st = challengeStatus(cur, today);
  const focusDay = st.nextDay ?? CHALLENGE_LENGTH;
  const shown = st.notStarted ? 1 : Math.min(focusDay, CHALLENGE_LENGTH);
  const blk = blockFor(shown);
  const day = dayOf(cur, shown);
  const upd = (n: number, p: Partial<ReturnType<typeof dayOf>>) => saveChallenge({ ...cur, days: { ...cur.days, [n]: { ...dayOf(cur, n), ...p } } });
  const tick = (n: number) => { const d = dayOf(cur, n); return upd(n, { done: !d.done, doneOn: d.done ? undefined : today }); };

  return (
    <Page title="30-day challenge" back="#/more">
      <Card>
        {st.finished ? <p className="big">Challenge complete — all 30 days done. 🎉</p> : st.notStarted
          ? <p className="big">Starts {formatDate(cur.startDate)}</p>
          : <p className="big">Resume at day {shown}<span className="muted"> · calendar says day {Math.min(st.scheduledDay, 99)}</span></p>}
        <Meter value={st.doneCount} max={30} />
        <div className="three"><div className="stat"><b>{st.doneCount}</b><span>completed</span></div><div className="stat"><b>{st.remaining}</b><span>remaining</span></div><div className="stat"><b>{st.missed.length}</b><span>behind schedule</span></div></div>
        {st.missed.length > 0 && <p className="note">Nothing was reset. Days {st.missed.length > 6 ? `${st.missed[0]}–${st.missed[st.missed.length - 1]}` : st.missed.join(", ")} are still open — do them whenever you are ready; days can be completed in any order.</p>}
      </Card>

      {!st.finished && (
        <Card title={`Day ${shown}: ${blk.title}`}>
          <p className="muted">{blk.focus}</p>
          <ul className="checks">
            {blk.objectives.map((o, i) => (
              <li key={i}><label><input type="checkbox" checked={day.objectives[i] ?? false} onChange={() => { const ob = [...day.objectives]; ob[i] = !ob[i]; upd(shown, { objectives: ob }); }} /> {o}</label></li>
            ))}
          </ul>
          <button className={`btn block ${day.done ? "" : "primary"}`} onClick={() => tick(shown).then(() => notify(day.done ? "Day unmarked" : `Day ${shown} complete`))}>{day.done ? "Day completed ✓ (tap to undo)" : "Mark day complete"}</button>
        </Card>
      )}

      <Card title="All days">
        <div className="chgrid">
          {Array.from({ length: CHALLENGE_LENGTH }, (_, i) => i + 1).map((n) => {
            const d = dayOf(cur, n); const missed = st.missed.includes(n);
            return <button key={n} className={`chd ${d.done ? "done" : missed ? "missed" : ""} ${n === shown ? "cur" : ""}`} onClick={() => setOpen(n)}
              aria-label={`Day ${n}, ${d.done ? "completed" : missed ? "behind schedule" : "upcoming"}`}>{n}</button>;
          })}
        </div>
        <p className="legend"><i className="sw met" /> done <i className="sw missed" /> behind schedule <i className="sw untracked" /> upcoming</p>
      </Card>

      <Card title="Restart or begin another">
        <p className="muted">Starting a new challenge archives this one. Nothing is deleted.</p>
        <button className="btn" onClick={() => setStartAt(today)}>Start a new challenge…</button>
        {archived.length > 0 && <ul className="plain">{archived.map((c) => <li key={c.id}>{formatDate(c.startDate, { day: "numeric", month: "short", year: "numeric" })}: {Object.values(c.days).filter((d) => d.done).length}/30 days</li>)}</ul>}
      </Card>

      {open && (() => { const n = open, d = dayOf(cur, n), b = blockFor(n); return (
        <Sheet title={`Day ${n} · ${formatDate(scheduledDate(cur, n), { day: "numeric", month: "short" })}`} onClose={() => setOpen(null)}>
          <p><b>{b.title}</b><br /><span className="muted">{b.focus}</span></p>
          <ul className="checks">{b.objectives.map((o, i) => <li key={i}><label><input type="checkbox" checked={d.objectives[i] ?? false} onChange={() => { const ob = [...d.objectives]; ob[i] = !ob[i]; upd(n, { objectives: ob }); }} /> {o}</label></li>)}</ul>
          <Field label="Progress note"><textarea rows={3} defaultValue={d.note} onBlur={(e) => e.target.value !== d.note && upd(n, { note: e.target.value })} /></Field>
          <button className={`btn block ${d.done ? "" : "primary"}`} onClick={() => tick(n)}>{d.done ? `Completed${d.doneOn ? " on " + formatDate(d.doneOn) : ""} — tap to undo` : "Mark day complete"}</button>
        </Sheet>); })()}
      {startAt !== null && (
        <Sheet title="Start a new challenge" onClose={() => setStartAt(null)}>
          <Field label="Start date" hint="Today or a past date. Your current challenge will be archived."><input type="date" value={startAt} max={today} onChange={(e) => setStartAt(e.target.value)} /></Field>
          <button className="btn primary block" onClick={async () => { await startChallenge(startAt || today); setStartAt(null); notify("New challenge started"); }}>Start</button>
        </Sheet>
      )}
      {challenges.length === 0 && <Empty>No challenge yet.</Empty>}
    </Page>
  );
}
