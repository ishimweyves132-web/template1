import { Card, Page } from "../ui/kit";

const items = [
  ["#/more/playbook", "Fast French", "Habits that make your hours count more"],
  ["#/more/challenge", "30-day challenge", "Daily objectives, resume after breaks"],
  ["#/more/goals", "Goals & badges", "Targets, milestones, personal records"],
  ["#/more/vocab", "Vocabulary", "Words and expressions you saved"],
  ["#/more/dictionary", "Dictionary & phrasebook", "Built in, works offline"],
  ["#/more/reminders", "Reminders", "Gentle, optional"],
  ["#/more/data", "Data & backup", "Export, import, safety copies"],
];
export function More() {
  return (
    <Page title="More">
      <Card><ul className="menu">{items.map(([h, t, s]) => <li key={h}><a href={h}><b>{t}</b><small>{s}</small><span>›</span></a></li>)}</ul></Card>
      <p className="note pad">French Mastery Tracker · everything is stored on this device. No account, no tracking, no AI.</p>
    </Page>
  );
}
