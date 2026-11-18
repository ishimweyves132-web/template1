import { useState } from "react";
import { useApp } from "../store";
import { Card, Page, ActivityDot } from "../ui/kit";
import { TIPS, type Tip } from "../data/playbook";
import { todaysBoost } from "../lib/boost";
import { ACTIVITY_LABEL } from "../lib/model";

export function TipCard({ tip, open, onToggle }: { tip: Tip; open: boolean; onToggle: () => void }) {
  return (
    <Card className="tip">
      <button className="tip-h" aria-expanded={open} onClick={onToggle}>
        {tip.activity !== "all" ? <ActivityDot a={tip.activity} /> : <i className="dot" aria-hidden />}
        <span className="grow"><b>{tip.title}</b><small className="sub">{tip.hook}</small></span>
        <span aria-hidden>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div className="tip-b">
          <p><b>Why it works.</b> {tip.why}</p>
          <p><b>Do this now ({tip.minutes} min):</b></p>
          <ol>{tip.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <a className="btn small" href="#/track">{tip.activity === "all" ? "Log a session" : `Log ${ACTIVITY_LABEL[tip.activity].toLowerCase()}`}</a>
        </div>
      )}
    </Card>
  );
}

export function Playbook() {
  const { ledger, settings, today } = useApp();
  const boost = todaysBoost(ledger, settings.targetHistory, today);
  const [open, setOpen] = useState<string | null>(boost.tip.id);
  return (
    <Page title="Fast French" back="#/more">
      <Card className="hero">
        <p className="big">Study smarter, not just longer.</p>
        <p className="muted">There is no secret shortcut and no one learns a language in days. But a handful of habits make the same hours count for much more. These are the ones that learners and teachers keep coming back to, tied to your own tracker.</p>
      </Card>
      <Card title="Today's boost"><p className="muted">{boost.reason}</p><p className="big">{boost.tip.title}</p>
        <a className="btn primary" href="#/more/playbook" onClick={() => setOpen(boost.tip.id)}>Show me how</a></Card>
      {TIPS.map((t) => <TipCard key={t.id} tip={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />)}
      <p className="note pad">These are practical habits, not guarantees. How fast you progress depends on your starting point and the hours you put in; the tracker shows you the hours honestly.</p>
    </Page>
  );
}
