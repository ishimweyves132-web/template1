import { useState } from "react";
import { useApp } from "../store";
import { Bar, Card, Empty, Field, PageHead, Sheet } from "../ui/kit";
import { ObjectiveSheet } from "./sheets";
import { diffDays, formatDate, addDays } from "../lib/dates";
import { LEVEL_LABEL, childLevel, type Objective } from "../lib/model";
import { objectiveOutcome, pace, type Pace } from "../domain/progress";

const PACE: Record<Pace, { t: string; c: string }> = { "not-started": { t: "Not started", c: "" }, ahead: { t: "Ahead", c: "good" }, "on-track": { t: "On track", c: "sage" }, behind: { t: "Behind", c: "sand" }, "at-risk": { t: "At risk", c: "warn" }, unmeasured: { t: "Not measured", c: "" } };
const SHORT: Record<string, string> = { "four-year": "4-year goal", annual: "Annual", quarterly: "Quarterly", monthly: "Monthly", weekly: "Weekly" };
const load = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem("lifeos-open") ?? "[]")); } catch { return new Set(); } };

export function Vision() {
  const { vision, objectives, krs, krPoints, tasks, today, areas, commit, notify } = useApp();
  const [open, setOpen] = useState<Set<string>>(load); const [sheet, setSheet] = useState<{ id?: string; parentId?: string | null } | null>(null); const [edit, setEdit] = useState(false);
  const v = vision[0]; const roots = objectives.filter((o) => !o.parentId && o.status !== "archived");
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem("lifeos-open", JSON.stringify([...n])); } catch { /* storage unavailable */ } return n; });
  const end = v ? addDays(v.horizonStart, v.horizonYears * 365) : null;

  const Node = ({ o, depth }: { o: Objective; depth: number }) => {
    const kids = objectives.filter((x) => x.parentId === o.id && x.status !== "archived"); const oc = objectiveOutcome(o, objectives, krs, krPoints); const p = PACE[pace(o, oc, today)]; const isOpen = open.has(o.id); const nt = tasks.filter((t) => t.objectiveId === o.id && t.status === "active").length; const next = childLevel(o.level);
    return (
      <div className="node">
        <div className="node-h">
          {kids.length ? <button className="caret" onClick={() => toggle(o.id)} aria-label={isOpen ? "Collapse" : "Expand"} aria-expanded={isOpen}>{isOpen ? "▾" : "▸"}</button> : <span className="caret" aria-hidden>·</span>}
          <button className="grow" style={{ all: "unset", cursor: "pointer", display: "block", minWidth: 0 }} onClick={() => setSheet({ id: o.id })} aria-label={`Open ${o.title}`}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><span className="lvl">{SHORT[o.level]} · {formatDate(o.target, { month: "short", year: "numeric" })}</span><span className={`pill ${p.c}`}>{p.t}</span></div>
            <div style={{ fontWeight: 600 }}>{o.title}</div>
            <div className="row" style={{ gap: 8, marginTop: 4 }}><div className="grow"><Bar frac={oc.fraction} tone={oc.fraction !== null && oc.fraction >= 0.9 ? "" : "sand"} /></div><span className="small num muted">{oc.fraction === null ? "–" : Math.round(oc.fraction * 100) + "%"}</span></div>
          </button>
          {nt > 0 && <span className="small muted" style={{ whiteSpace: "nowrap" }}>{nt} task{nt === 1 ? "" : "s"}</span>}
          {next && <button className="btn small" onClick={() => setSheet({ parentId: o.id })} aria-label={`Add ${LEVEL_LABEL[next]} under ${o.title}`}>＋</button>}
        </div>
        {isOpen && kids.length > 0 && <div className="kids">{kids.map((k) => <Node key={k.id} o={k} depth={depth + 1} />)}</div>}
      </div>
    );
  };
  return (
    <div>
      <PageHead title="Vision" sub="The life you are building, from four years down to today." right={<button className="btn primary small" onClick={() => setSheet({ parentId: null })}>＋ Four-year goal</button>} />
      <Card title="Your four-year vision" action={<button className="btn small" onClick={() => setEdit(true)}>{v ? "Edit" : "Write it"}</button>}>
        {v ? <><p className="big">{v.statement}</p>{v.why && <p className="muted">{v.why}</p>}{end && <p className="small muted">{diffDays(today, end) > 0 ? `${Math.round(diffDays(today, end) / 365 * 10) / 10} years remain in this horizon (to ${formatDate(end, { month: "long", year: "numeric" })}).` : "This horizon has ended: time to write the next one."}</p>}</>
          : <Empty>Describe the life you want in a sentence or two. It anchors every goal below it. LifeOS will never change it for you.</Empty>}
      </Card>
      <div className="cols">
        <Card title="Goal explorer">
          {roots.length === 0 ? <Empty>No goals yet. Add a four-year goal, then break it into annual, quarterly and monthly steps. Tap an objective to add measurable key results and tasks.</Empty> : <div className="tree">{roots.map((o) => <Node key={o.id} o={o} depth={0} />)}</div>}
        </Card>
        <Card title="Life areas">
          {areas.length === 0 ? <Empty>Areas group your goals (health, career, learning…). Add them when creating a goal.</Empty> : <div className="row wrap">{areas.map((a) => <span key={a.id} className="chip">{a.name} <span className="muted">· {objectives.filter((o) => o.areaId === a.id && !o.parentId).length}</span></span>)}</div>}
          <p className="small muted" style={{ marginTop: 12 }}>Completing tasks does not complete a goal. A goal is achieved when its measured result and completion criteria say so.</p>
        </Card>
      </div>
      {sheet && <ObjectiveSheet {...sheet} onClose={() => setSheet(null)} />}
      {edit && <VisionSheet onClose={() => setEdit(false)} onSaved={() => notify("Vision saved")} commit={commit} />}
    </div>
  );
}
function VisionSheet({ onClose, onSaved, commit }: { onClose: () => void; onSaved: () => void; commit: ReturnType<typeof useApp>["commit"] }) {
  const { vision, today } = useApp(); const v = vision[0]; const [f, setF] = useState({ statement: v?.statement ?? "", why: v?.why ?? "", years: String(v?.horizonYears ?? 4) });
  const y = Number(f.years); const bad = !f.statement.trim() || !Number.isInteger(y) || y < 1 || y > 10;
  return (
    <Sheet title="Your vision" onClose={onClose}>
      <Field label="The life I want to build"><textarea rows={3} value={f.statement} onChange={(x) => setF({ ...f, statement: x.target.value })} placeholder="In four years, I…" /></Field>
      <Field label="Why it matters"><textarea rows={2} value={f.why} onChange={(x) => setF({ ...f, why: x.target.value })} /></Field>
      <Field label="Planning horizon (years)"><input inputMode="numeric" value={f.years} onChange={(x) => setF({ ...f, years: x.target.value.replace(/\D/g, "") })} /></Field>
      <button className="btn primary block" disabled={bad} onClick={async () => { await commit({ put: { vision: [{ id: "vision", statement: f.statement.trim(), why: f.why.trim(), horizonStart: v?.horizonStart ?? today, horizonYears: y, updatedAt: Date.now() }] } }); onSaved(); onClose(); }}>Save</button>
    </Sheet>
  );
}
