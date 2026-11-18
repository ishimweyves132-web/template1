import { useMemo, useState } from "react";
import { useApp } from "../store";
import { Card, Page, Segmented, BarChart, Meter, ActivityDot, Empty, Sheet, dayLabel } from "../ui/kit";
import { SessionSheet, type SessionDraft } from "./SessionSheet";
import { ACTIVITIES, ACTIVITY_LABEL } from "../lib/model";
import { addDays, addMonths, daysInMonth, formatDate, formatMinutes, hours, monthStart, weekStart, weekdayIndex, type DateStr } from "../lib/dates";
import { bars, evalDay, overall, streaks, summarize } from "../lib/stats";

type Tab = "stats" | "calendar";
export function Progress({ sub }: { sub?: string }) {
  const tab: Tab = sub === "calendar" ? "calendar" : "stats";
  return (
    <Page title="Progress">
      <Segmented label="Progress sections" value={tab} onChange={(v) => { location.hash = `#/progress${v === "calendar" ? "/calendar" : ""}`; }} options={[{ v: "stats", t: "Statistics" }, { v: "calendar", t: "Calendar" }]} />
      {tab === "stats" ? <Stats /> : <CalendarView />}
    </Page>
  );
}

function Stats() {
  const { ledger, settings, today } = useApp();
  const hist = settings.targetHistory;
  const [unit, setUnit] = useState<"day" | "week" | "month">("day");
  const [cmp, setCmp] = useState<"week" | "month">("week");
  const tot = overall(ledger), st = streaks(ledger, today);
  const d30 = summarize(ledger, hist, addDays(today, -29), today, today);
  const all = summarize(ledger, hist, ledger.first ?? today, today, today);
  const count = unit === "day" ? 14 : unit === "week" ? 8 : 6;
  const data = useMemo(() => bars(ledger, hist, unit, count, today), [ledger, hist, unit, count, today]);

  const periods = (kind: "week" | "month") => {
    const cur = kind === "week" ? weekStart(today) : monthStart(today);
    return Array.from({ length: 12 }, (_, i) => {
      const from = kind === "week" ? addDays(cur, -7 * i) : addMonths(cur, -i);
      const to = kind === "week" ? addDays(from, 6) : addDays(addMonths(from, 1), -1);
      return { from, to, label: i === 0 ? (kind === "week" ? "This week" : "This month") : i === 1 ? (kind === "week" ? "Last week" : "Last month")
        : kind === "week" ? `Week of ${dayLabel(from)}` : formatDate(from, { month: "long", year: "numeric" }) };
    });
  };
  const opts = periods(cmp);
  const [ia, setIa] = useState(0), [ib, setIb] = useState(1);
  const A = opts[Math.min(ia, 11)]!, B = opts[Math.min(ib, 11)]!;
  const sa = summarize(ledger, hist, A.from, A.to, today), sb = summarize(ledger, hist, B.from, B.to, today);

  if (!ledger.first) return <Card><Empty>Statistics are calculated from your recorded sessions. Log your first session on the Track tab.</Empty></Card>;
  const fmt = (d: DateStr, u: typeof unit) => u === "month" ? formatDate(d, { month: "short" }) : u === "week" ? dayLabel(d) : formatDate(d, { day: "numeric" });
  return (
    <>
      <Card title="Totals">
        <div className="grid2">
          <div className="stat"><b>{hours(tot.total)}</b><span>total hours</span></div>
          <div className="stat"><b>{tot.sessions}</b><span>sessions completed</span></div>
          <div className="stat"><b>{Math.round(all.avgPerDay)}</b><span>avg min per day (all days since first record)</span></div>
          <div className="stat"><b>{d30.consistency}%</b><span>consistency, last 30 days ({d30.daysStudied} of {d30.days} days)</span></div>
          <div className="stat"><b>{st.current}</b><span>current streak</span></div>
          <div className="stat"><b>{st.longest}</b><span>longest streak</span></div>
        </div>
      </Card>

      <Card title="Minutes studied" action={<Segmented label="Chart range" value={unit} onChange={setUnit} options={[{ v: "day", t: "Daily" }, { v: "week", t: "Weekly" }, { v: "month", t: "Monthly" }]} />}>
        <BarChart height={170} data={data.map((b, i) => ({ label: fmt(b.from, unit), value: b.minutes, target: unit === "day" ? b.target || undefined : undefined,
          title: `${dayLabel(b.from)}${unit === "day" ? "" : " – " + dayLabel(b.to)}: ${formatMinutes(b.minutes)}`, highlight: i === data.length - 1 }))}
          summary={`${unit} minutes studied: ${data.map((b) => `${b.from} ${b.minutes}`).join(", ")}`} />
        {unit === "day" && <p className="legend"><i className="swatch" /> minutes <i className="tickswatch" /> daily target</p>}
      </Card>

      <Card title="Goals vs actual, last 30 days">
        <p className="muted">Average minutes per day against your daily target. Based on {d30.days} tracked day{d30.days === 1 ? "" : "s"}.</p>
        <ul className="rows">
          {ACTIVITIES.map((a) => {
            const s = d30.byActivity[a]; const avg = d30.days ? s.achieved / d30.days : 0; const tg = d30.days ? s.target / d30.days : 0;
            return (
              <li key={a}><ActivityDot a={a} /><span className="grow">{ACTIVITY_LABEL[a]}<small className="sub">{tg > 0 ? `target met on ${s.daysHit} of ${d30.days} days` : "optional, no target"}</small></span>
                <b>{avg.toFixed(1)}<span className="muted"> {tg > 0 ? `/ ${tg.toFixed(0)}` : ""} min</span></b>
                {tg > 0 && <div className="full"><Meter value={avg} max={tg} tone={avg >= tg ? "done" : "partial"} /></div>}</li>
            );
          })}
        </ul>
        <p className="note">Time completion over this period: {d30.timePct}% of the total target minutes.</p>
      </Card>

      <Card title="Compare periods" action={<Segmented label="Compare by" value={cmp} onChange={(v) => { setCmp(v); setIa(0); setIb(1); }} options={[{ v: "week", t: "Weeks" }, { v: "month", t: "Months" }]} />}>
        <div className="row2">
          <label className="field"><span>Period A</span><select value={ia} onChange={(e) => setIa(Number(e.target.value))}>{opts.map((o, i) => <option key={o.from} value={i}>{o.label}</option>)}</select></label>
          <label className="field"><span>Period B</span><select value={ib} onChange={(e) => setIb(Number(e.target.value))}>{opts.map((o, i) => <option key={o.from} value={i}>{o.label}</option>)}</select></label>
        </div>
        <table className="cmp">
          <thead><tr><th></th><th>A</th><th>B</th><th>Change</th></tr></thead>
          <tbody>
            {([["Total time", sa.total, sb.total, (m: number) => formatMinutes(m)], ["Sessions", sa.sessions, sb.sessions, (m: number) => String(m)], ["Days studied", sa.daysStudied, sb.daysStudied, (m: number) => String(m)]] as const).map(([l, x, y, f]) => (
              <tr key={l}><th>{l}</th><td>{f(x)}</td><td>{f(y)}</td><td className={x >= y ? "up" : "down"}>{x === y ? "same" : `${x > y ? "+" : "−"}${f(Math.abs(x - y))}`}</td></tr>
            ))}
            {ACTIVITIES.map((a) => { const x = sa.byActivity[a].achieved, y = sb.byActivity[a].achieved; if (!x && !y) return null; return (
              <tr key={a}><th>{ACTIVITY_LABEL[a]}</th><td>{formatMinutes(x)}</td><td>{formatMinutes(y)}</td><td className={x >= y ? "up" : "down"}>{x === y ? "same" : `${x > y ? "+" : "−"}${formatMinutes(Math.abs(x - y))}`}</td></tr>); })}
          </tbody>
        </table>
        <p className="note">Periods that are still running only count the days so far, so compare with care.</p>
      </Card>
    </>
  );
}

function CalendarView() {
  const { ledger, settings, today, sessions, deleteSession, notify, toggleMark } = useApp();
  const hist = settings.targetHistory;
  const [month, setMonth] = useState(monthStart(today));
  const [sel, setSel] = useState<DateStr>(today);
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const lead = weekdayIndex(month), n = daysInMonth(month);
  const cells: (DateStr | null)[] = [...Array(lead).fill(null), ...Array.from({ length: n }, (_, i) => addDays(month, i))];
  const cellClass = (d: DateStr) => {
    if (d > today) return "future";
    if (!ledger.first || d < ledger.first) return "untracked";
    const e = evalDay(ledger, hist, d);
    if (e.state === "complete") return "met";
    if (e.state === "partial") return `part l${e.timePct >= 66 ? 3 : e.timePct >= 33 ? 2 : 1}`;
    return d === today ? "pending" : "missed";
  };
  const e = evalDay(ledger, hist, sel);
  const daySessions = sessions.filter((s) => s.date === sel);
  const nextOk = addMonths(month, 1) <= monthStart(today);
  return (
    <>
      <Card>
        <div className="monthnav">
          <button className="btn" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>‹</button>
          <b>{formatDate(month, { month: "long", year: "numeric" })}</b>
          <button className="btn" aria-label="Next month" disabled={!nextOk} onClick={() => setMonth(addMonths(month, 1))}>›</button>
        </div>
        <div className="cal" role="grid" aria-label="Learning calendar">
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <span key={i} className="wd">{w}</span>)}
          {cells.map((d, i) => d === null ? <span key={i} /> : (
            <button key={d} role="gridcell" className={`day ${cellClass(d)} ${d === sel ? "sel" : ""} ${d === today ? "today" : ""}`} onClick={() => setSel(d)}
              disabled={d > today} aria-label={`${formatDate(d)}: ${cellClass(d).startsWith("untracked") ? "before tracking began" : `${ledger.days.get(d)?.total ?? 0} minutes, ${cellClass(d).split(" ")[0]}`}`}>
              <span>{Number(d.slice(8))}</span><small>{(ledger.days.get(d)?.total ?? 0) > 0 ? ledger.days.get(d)!.total : cellClass(d) === "missed" ? "–" : ""}</small>
            </button>
          ))}
        </div>
        <p className="legend"><i className="sw met" /> target met <i className="sw part l2" /> studied (shade = % of target) <i className="sw missed" /> missed <i className="sw untracked" /> before tracking</p>
      </Card>

      <Card title={formatDate(sel, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        action={<button className="btn small" onClick={() => setDraft({ date: sel, activity: "listening", minutes: 0 })}>＋ Add</button>}>
        {!ledger.first || sel < ledger.first ? <Empty>This is before your first recorded day.</Empty> : (
          <>
            <div className="three"><div className="stat"><b>{formatMinutes(e.total)}</b><span>studied</span></div>
              <div className="stat"><b>{e.targetTotal ? `${e.timePct}%` : "–"}</b><span>of {formatMinutes(e.targetTotal)}</span></div>
              <div className="stat"><b>{e.completed}/{e.completed + e.partial + e.missed}</b><span>activities done</span></div></div>
            <ul className="rows">
              {e.items.filter((i) => i.target > 0 || i.achieved > 0).map((i) => (
                <li key={i.activity}><ActivityDot a={i.activity} /><span className="grow">{ACTIVITY_LABEL[i.activity]}</span><span className="muted">{i.achieved}{i.target ? ` / ${i.target}` : ""} min</span>
                  <span className={`pill ${i.state}`}>{{ done: i.marked && i.achieved < i.target ? "Marked done" : "Done", partial: "Partial", missed: "Missed", extra: "Extra", off: "" }[i.state]}</span>
                  {i.target > 0 && i.state !== "done" && <button className="link" onClick={() => toggleMark(sel, i.activity)}>Mark done</button>}
                  {i.marked && <button className="link" onClick={() => toggleMark(sel, i.activity)}>Unmark</button>}</li>
              ))}
            </ul>
            {daySessions.length === 0 ? <p className="note">{sel === today ? "Nothing recorded yet today." : "No sessions were recorded on this day. The day stays in your history as it was."}</p> : daySessions.map((s) => (
              <div key={s.id} className="sess-d">
                <div className="sess"><ActivityDot a={s.activity} /><span className="grow"><b>{ACTIVITY_LABEL[s.activity]}</b> · {s.minutes} min</span>
                  <button className="link" onClick={() => setDraft({ ...s })}>Edit</button>
                  <button className="link danger" onClick={() => confirm("Delete this session?") && deleteSession(s.id).then(() => notify("Session deleted"))}>Delete</button></div>
                {s.learned && <p><b>Learned:</b> {s.learned}</p>}{s.difficulties && <p><b>Difficulties:</b> {s.difficulties}</p>}{s.notes && <p><b>Notes:</b> {s.notes}</p>}
              </div>))}
          </>
        )}
      </Card>
      {draft && <SessionSheet draft={draft} onClose={() => setDraft(null)} />}
    </>
  );
}
export { Sheet };
