import { useApp } from "../store";
import { Card, Page, Empty, ActivityDot, Meter } from "../ui/kit";
import { ACTIVITY_LABEL } from "../lib/model";
import { activityRows, DISCLAIMER, observations } from "../lib/weakness";
import { formatDate } from "../lib/dates";

export function Focus() {
  const { ledger, settings, today } = useApp();
  const hist = settings.targetHistory;
  const obs = observations(ledger, hist, today);
  const rows = activityRows(ledger, hist, today);
  const attention = obs.filter((o) => o.level === "attention");
  const notes = obs.filter((o) => o.level === "note");
  const good = obs.filter((o) => o.level === "good");

  if (!ledger.first) return <Page title="Focus"><Card><Empty>Once you have recorded a few days, this page will show what you are neglecting, based only on your records.</Empty></Card></Page>;
  const dayCount = rows[0]?.daysTracked ?? 0;
  const worst = [...rows].filter((r) => r.target > 0).sort((a, b) => a.pctOfTarget - b.pctOfTarget)[0];

  return (
    <Page title="Focus">
      <Card title="Needs attention">
        {attention.length === 0
          ? <Empty>{dayCount < 3 ? "Not enough days recorded yet to spot patterns." : "Nothing stands out right now."}</Empty>
          : <ul className="obs">{attention.map((o, i) => <li key={i} className="attention">{o.activity && <ActivityDot a={o.activity} />}<span>{o.text}</span></li>)}</ul>}
        {notes.length > 0 && <ul className="obs">{notes.map((o, i) => <li key={i} className="note-i"><span>{o.text}</span></li>)}</ul>}
      </Card>
      {worst && dayCount >= 3 && worst.pctOfTarget < 100 && (
        <Card title="Suggested focus">
          <p className="big">{ACTIVITY_LABEL[worst.activity]}</p>
          <p className="muted">Lowest share of its target in the last {dayCount} days ({worst.pctOfTarget}%).
            {worst.daysSince !== null ? ` Last practised ${worst.daysSince === 0 ? "today" : `${worst.daysSince} day${worst.daysSince === 1 ? "" : "s"} ago`}.` : " Not practised yet."}</p>
          <a className="btn primary" href="#/track">Go to Track</a>
        </Card>
      )}
      <Card title={`Activities, last ${dayCount} day${dayCount === 1 ? "" : "s"}`}>
        <ul className="rows">
          {rows.map((r) => (
            <li key={r.activity}>
              <ActivityDot a={r.activity} /><span className="grow"><b>{ACTIVITY_LABEL[r.activity]}</b>
                <small className="block">{r.target > 0 ? `${r.daysHit}/${r.daysTracked} days target met · ` : "optional · "}{r.daysPracticed} day{r.daysPracticed === 1 ? "" : "s"} practised ·
                  {r.lastDate ? ` last ${formatDate(r.lastDate, { day: "numeric", month: "short" })}` : " never"}</small></span>
              {r.target > 0 && <b>{r.pctOfTarget}%</b>}
              {r.target > 0 && <div className="full"><Meter value={r.pctOfTarget} max={100} tone={r.pctOfTarget >= 80 ? "done" : r.pctOfTarget >= 40 ? "partial" : "missed"} /></div>}
            </li>
          ))}
        </ul>
      </Card>
      {good.length > 0 && <Card title="Going well"><ul className="obs">{good.map((o, i) => <li key={i} className="goodi">{o.activity && <ActivityDot a={o.activity} />}<span>{o.text}</span></li>)}</ul></Card>}
      <p className="note pad">{DISCLAIMER}</p>
    </Page>
  );
}
