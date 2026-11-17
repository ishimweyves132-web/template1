import { useEffect, useState } from "react";
import { useApp } from "../store";
import { Card, Page, Sheet, Field, ActivityDot, Empty } from "../ui/kit";
import { SessionSheet, type SessionDraft } from "./SessionSheet";
import { ACTIVITIES, ACTIVITY_HINT, ACTIVITY_LABEL, markKey, type Activity } from "../lib/model";
import { evalDay } from "../lib/stats";

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <b className="clock">{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</b>;
}

export function Track() {
  const { ledger, settings, today, sessions, startTimer, clearTimer, toggleMark, setTarget, deleteSession, notify } = useApp();
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [tgt, setTgt] = useState<Activity | null>(null);
  const [tv, setTv] = useState("");
  const day = evalDay(ledger, settings.targetHistory, today);
  const timer = settings.activeTimer;
  const todays = sessions.filter((s) => s.date === today);

  const stop = () => {
    if (!timer) return;
    const secs = (Date.now() - timer.startedAt) / 1000;
    setDraft({ date: today, activity: timer.activity, minutes: secs < 30 ? 0 : Math.max(1, Math.round(secs / 60)), source: "timer" });
  };

  return (
    <Page title="Track">
      {timer && (
        <div className="timer" role="timer">
          <div><span className="muted">Session running · {ACTIVITY_LABEL[timer.activity]}</span><Elapsed since={timer.startedAt} /></div>
          <div className="btns"><button className="btn primary" onClick={stop}>Finish</button>
            <button className="btn" onClick={() => confirm("Discard this running session without saving?") && clearTimer()}>Discard</button></div>
        </div>
      )}
      <ul className="acts">
        {day.items.map((i) => (
          <li key={i.activity} className="act">
            <div className="act-top">
              <ActivityDot a={i.activity} />
              <div className="grow"><b>{ACTIVITY_LABEL[i.activity]}</b><small>{ACTIVITY_HINT[i.activity]}</small></div>
              <div className="num"><b>{i.achieved}</b><small>{i.target > 0 ? `of ${i.target} min` : "min · optional"}</small></div>
            </div>
            <div className="btns">
              <button className="btn" disabled={!!timer} onClick={() => startTimer(i.activity)}>▶ Start</button>
              <button className="btn" onClick={() => setDraft({ date: today, activity: i.activity, minutes: 0 })}>＋ Add minutes</button>
              {i.target > 0 && <button className={`btn ${i.marked ? "on" : ""}`} aria-pressed={i.marked}
                onClick={() => toggleMark(today, i.activity)} title="Mark as done without changing recorded minutes">{i.marked ? "✓ Done" : "Mark done"}</button>}
              <button className="btn ghost" onClick={() => { setTgt(i.activity); setTv(String(i.target)); }}>Target</button>
            </div>
          </li>
        ))}
      </ul>

      <Card title="Today's sessions">
        {todays.length === 0 ? <Empty>No sessions recorded today. Partial progress is fine — record what you actually did.</Empty> : (
          <ul className="rows">
            {todays.map((s) => (
              <li key={s.id} className="sess">
                <ActivityDot a={s.activity} /><span className="grow"><b>{ACTIVITY_LABEL[s.activity]}</b> · {s.minutes} min{s.source === "timer" ? " ⏱" : ""}</span>
                <button className="link" onClick={() => setDraft({ ...s })}>Edit</button>
                <button className="link danger" onClick={() => confirm("Delete this session?") && deleteSession(s.id).then(() => notify("Session deleted"))}>Delete</button>
                {(s.learned || s.difficulties || s.notes) && <div className="full small">
                  {s.learned && <p><b>Learned:</b> {s.learned}</p>}{s.difficulties && <p><b>Difficulties:</b> {s.difficulties}</p>}{s.notes && <p><b>Notes:</b> {s.notes}</p>}</div>}
              </li>
            ))}
          </ul>
        )}
        <a className="linkrow" href="#/progress/calendar"><span>Missed a day? Add past sessions in the Calendar</span><span>›</span></a>
      </Card>

      {draft && <SessionSheet draft={draft} onClose={() => setDraft(null)} onSaved={() => { if (draft.source === "timer") void clearTimer(); }}
        title={draft.source === "timer" ? "Session finished" : undefined} />}
      {tgt && (
        <Sheet title={`${ACTIVITY_LABEL[tgt]} daily target`} onClose={() => setTgt(null)}>
          <form onSubmit={async (e) => { e.preventDefault(); const n = Number(tv); if (Number.isInteger(n) && n >= 0 && n <= 600) { await setTarget(tgt, n); notify("Target updated from today"); setTgt(null); } }}>
            <Field label="Minutes per day" hint="0 makes this activity optional. Changing a target never rewrites past days.">
              <input inputMode="numeric" value={tv} onChange={(e) => setTv(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <button className="btn primary block">Save target</button>
          </form>
        </Sheet>
      )}
    </Page>
  );
}
export { markKey };
export const ACTIVITY_LIST = ACTIVITIES;
