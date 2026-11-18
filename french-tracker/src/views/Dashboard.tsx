import { useApp } from "../store";
import { Card, Ring, Meter, BarChart, Empty, ActivityDot, weekdayShort } from "../ui/kit";
import { addDays, diffDays, formatMinutes, hours, weekStart } from "../lib/dates";
import { ACTIVITY_LABEL } from "../lib/model";
import { evalDay, overall, streaks, summarize } from "../lib/stats";
import { challengeStatus } from "../lib/challenge";
import { nextMilestone } from "../lib/goals";
import { reminderDue } from "../lib/reminders";
import { todaysBoost } from "../lib/boost";
import { dueList } from "../lib/review";

export function Dashboard() {
  const { ledger, settings, today, sessions, vocab, goals, challenges } = useApp();
  const hist = settings.targetHistory;
  const day = evalDay(ledger, hist, today);
  const st = streaks(ledger, today);
  const ws = weekStart(today);
  const week = summarize(ledger, hist, ws, addDays(ws, 6), today);
  const elapsed = diffDays(ws, today);
  const prev = summarize(ledger, hist, addDays(ws, -7), addDays(ws, -7 + elapsed), today);
  const tot = overall(ledger);
  const ch = challenges.find((c) => !c.archivedAt);
  const chs = ch ? challengeStatus(ch, today) : null;
  const ms = nextMilestone(goals, sessions, vocab, challenges, hist, today);
  const weekBars = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i); const e = evalDay(ledger, hist, d);
    return { label: weekdayShort(d), value: e.total, target: e.targetTotal || undefined, title: `${d}: ${e.total} min`, highlight: d === today };
  });
  const lastStudy = [...ledger.days.entries()].filter(([, r]) => r.total > 0).map(([d]) => d).sort().pop();
  const idle = lastStudy ? diffDays(lastStudy, today) : null;

  // Is it going well or not? Only facts: today vs target, this week vs the same days last week.
  let tone: "good" | "warn" | "calm" = "calm", headline: string, detail = "";
  if (!ledger.first) { headline = "Welcome. Log your first session to start tracking."; }
  else if (day.state === "complete" && day.targetTotal > 0) { tone = "good"; headline = "Today's targets are complete."; }
  else if (day.total > 0) { headline = `${formatMinutes(day.total)} done today — ${day.timePct}% of your ${formatMinutes(day.targetTotal)} target.`; }
  else if (idle !== null && idle >= 2) { tone = "warn"; headline = `No practice logged for ${idle} days.`; detail = "One short session is enough to restart."; }
  else headline = "Nothing logged yet today.";
  if (ledger.first && prev.total > 0 && elapsed >= 1) {
    const ch = Math.round(((week.total - prev.total) / prev.total) * 100);
    const t = `This week so far: ${formatMinutes(week.total)}, compared with ${formatMinutes(prev.total)} on the same days last week.`;
    detail = detail ? `${detail} ${t}` : t;
    if (ch >= 0 && tone === "calm") tone = "good"; else if (ch <= -25 && tone === "calm") tone = "warn";
  }
  const boost = todaysBoost(ledger, hist, today);
  const due = dueList(vocab, today);
  const rem = reminderDue(new Date(), settings.reminders, day.total > 0, today);

  return (
    <div className="page">
      <header className="page-h"><h1>Today</h1></header>
      <div className={`status ${tone}`} role="status"><b>{tone === "good" ? "On track" : tone === "warn" ? "Falling behind" : "Today"}</b><span>{headline} {detail}</span></div>
      {rem && <div className="status calm"><span>Gentle reminder: nothing logged yet today. Even 10 minutes counts.</span></div>}

      <Card title="Today's progress" action={<a className="btn small" href="#/track">Log practice</a>}>
        <div className="today">
          <Ring pct={day.timePct} label={`${day.timePct}%`} sub="of target" />
          <dl className="facts">
            <div><dt>Studied</dt><dd>{formatMinutes(day.total)}</dd></div>
            <div><dt>Target</dt><dd>{formatMinutes(day.targetTotal)}</dd></div>
            <div><dt>Completed</dt><dd>{day.completed} of {day.completed + day.partial + day.missed}</dd></div>
          </dl>
        </div>
        <ul className="rows">
          {day.items.filter((i) => i.target > 0 || i.achieved > 0).map((i) => (
            <li key={i.activity}>
              <ActivityDot a={i.activity} /><span className="grow">{ACTIVITY_LABEL[i.activity]}</span>
              <span className="muted">{i.achieved}{i.target > 0 ? ` / ${i.target}` : ""} min</span>
              <span className={`pill ${i.state}`}>{{ done: "Done", partial: "Partial", missed: "To do", extra: "Extra", off: "" }[i.state]}</span>
              <div className="full"><Meter value={i.achieved} max={i.target || i.achieved || 1} tone={i.state} /></div>
            </li>
          ))}
        </ul>
        {day.state !== "none" && day.missed + day.partial > 0 && (
          <p className="note">Remaining: {day.items.filter((i) => i.state === "missed" || i.state === "partial").map((i) => ACTIVITY_LABEL[i.activity]).join(", ")}.</p>
        )}
      </Card>

      <Card title="Today's boost" action={<a className="btn small" href="#/more/playbook">Fast French</a>}>
        <p className="big">{boost.tip.title}</p>
        <p className="muted">{boost.reason}</p>
        <p className="small">{boost.tip.hook}</p>
        {due.length > 0 && <a className="linkrow" href="#/more/vocab"><span>{due.length} saved word{due.length === 1 ? "" : "s"} due for review</span><span>›</span></a>}
      </Card>

      <Card title="This week" action={<span className="muted">{formatMinutes(week.total)} · {week.daysStudied} day{week.daysStudied === 1 ? "" : "s"}</span>}>
        <BarChart data={weekBars} height={130} summary={`Minutes studied each day this week: ${weekBars.map((b) => `${b.label} ${b.value}`).join(", ")}`} />
        <p className="legend"><i className="swatch" /> minutes studied &nbsp; <i className="tickswatch" /> daily target</p>
      </Card>

      <Card title="Overall progress">
        {tot.sessions === 0 ? <Empty>No sessions yet. Everything here is calculated from what you record.</Empty> : (
          <div className="three">
            <div className="stat"><b>{st.current}</b><span>day streak</span></div>
            <div className="stat"><b>{st.longest}</b><span>longest streak</span></div>
            <div className="stat"><b>{hours(tot.total)}</b><span>total hours</span></div>
            <div className="stat"><b>{tot.sessions}</b><span>sessions</span></div>
            <div className="stat"><b>{tot.days}</b><span>days studied</span></div>
          </div>
        )}
        {chs && <a className="linkrow" href="#/more/challenge"><span>30-day challenge</span><span className="muted">{chs.doneCount} / 30 days done</span></a>}
        <Meter value={chs?.doneCount ?? 0} max={30} />
      </Card>

      <Card title="Next milestone">
        {ms ? <><p className="big">{ms.title}</p><Meter value={ms.pct} max={100} /><p className="muted">{ms.remaining} ({ms.pct}%)</p></> : <Empty>Create a goal to see your next milestone.</Empty>}
        <a className="linkrow" href="#/more/goals"><span>Goals & badges</span><span>›</span></a>
      </Card>
    </div>
  );
}
