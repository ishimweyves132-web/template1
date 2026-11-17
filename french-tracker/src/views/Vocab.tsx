import { useState } from "react";
import { useApp } from "../store";
import { Card, Page, Sheet, Field, Segmented, Empty } from "../ui/kit";
import { diffDays, formatDate } from "../lib/dates";
import type { VocabEntry } from "../lib/model";
import { normalize } from "../lib/dict";

export function Vocab() {
  const { vocab, today, saveVocab, deleteVocab, reviewVocab, notify } = useApp();
  const [q, setQ] = useState(""); const [filter, setFilter] = useState<"all" | "learning" | "learned">("all");
  const [sort, setSort] = useState<"new" | "review">("new");
  const [edit, setEdit] = useState<Partial<VocabEntry> | null>(null);
  const nq = normalize(q);
  const lastRev = (v: VocabEntry) => v.reviews.length ? v.reviews[v.reviews.length - 1]! : null;
  const list = vocab.filter((v) => (filter === "all" || v.status === filter) && (!nq || normalize(`${v.fr} ${v.en} ${v.notes} ${v.example}`).includes(nq)))
    .sort((a, b) => sort === "new" ? b.addedAt.localeCompare(a.addedAt) : (lastRev(a) ?? "").localeCompare(lastRev(b) ?? "") || a.addedAt.localeCompare(b.addedAt));
  const learned = vocab.filter((v) => v.status === "learned").length;
  return (
    <Page title="Vocabulary" back="#/more" right={<button className="btn small" onClick={() => setEdit({ fr: "", en: "", example: "", notes: "" })}>＋ Add</button>}>
      <div className="two"><div className="stat"><b>{vocab.length}</b><span>saved</span></div><div className="stat"><b>{learned}</b><span>learned</span></div></div>
      <input className="search" type="search" placeholder="Search saved words" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search saved words" />
      <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ v: "all", t: "All" }, { v: "learning", t: "Learning" }, { v: "learned", t: "Learned" }]} />
      <Segmented label="Sort" value={sort} onChange={setSort} options={[{ v: "new", t: "Newest" }, { v: "review", t: "Least reviewed first" }]} />
      <Card>{list.length === 0 ? <Empty>{vocab.length ? "No matches." : "No saved words yet. Add expressions you meet, or save them from the Dictionary."}</Empty> : (
        <ul className="rows col">{list.map((v) => { const lr = lastRev(v); return (
          <li key={v.id} className="vocab">
            <div className="sess"><b className="grow big">{v.fr}</b><span className={`pill ${v.status === "learned" ? "done" : "partial"}`}>{v.status === "learned" ? "Learned" : "Learning"}</span></div>
            {v.en && <p>{v.en}</p>}{v.example && <p className="muted"><i>{v.example}</i></p>}{v.notes && <p className="small">{v.notes}</p>}
            <small className="muted">Added {formatDate(v.addedAt, { day: "numeric", month: "short" })} · {v.reviews.length ? `reviewed ${v.reviews.length}×, last ${lr === today ? "today" : `${diffDays(lr!, today)} d ago`}` : "not reviewed yet"}</small>
            <div className="btns">
              <button className="btn small" disabled={lr === today} onClick={() => reviewVocab(v.id).then(() => notify("Review recorded"))}>{lr === today ? "Reviewed today ✓" : "I reviewed this"}</button>
              <button className="btn small" onClick={() => saveVocab({ ...v, status: v.status === "learned" ? "learning" : "learned" })}>{v.status === "learned" ? "Still learning" : "Mark learned"}</button>
              <button className="btn small ghost" onClick={() => setEdit(v)}>Edit</button>
            </div>
          </li>); })}</ul>)}</Card>
      {edit && <VocabSheet v={edit} onClose={() => setEdit(null)} onDelete={edit.id ? async () => { if (confirm("Delete this entry?")) { await deleteVocab(edit.id!); setEdit(null); } } : undefined} />}
    </Page>
  );
}

export function VocabSheet({ v, onClose, onDelete }: { v: Partial<VocabEntry>; onClose: () => void; onDelete?: (() => void) | undefined }) {
  const { saveVocab, vocab, notify } = useApp();
  const [f, setF] = useState({ fr: v.fr ?? "", en: v.en ?? "", example: v.example ?? "", notes: v.notes ?? "" });
  const dup = !v.id && vocab.some((x) => normalize(x.fr) === normalize(f.fr));
  return (
    <Sheet title={v.id ? "Edit entry" : "Add word or expression"} onClose={onClose}>
      <form onSubmit={async (e) => { e.preventDefault(); if (!f.fr.trim() || dup) return; await saveVocab({ ...v, ...f, fr: f.fr.trim() }); notify("Saved"); onClose(); }}>
        <Field label="French" hint={dup ? "Already in your collection." : ""}><input value={f.fr} onChange={(e) => setF({ ...f, fr: e.target.value })} lang="fr" autoCapitalize="none" /></Field>
        <Field label="English meaning"><input value={f.en} onChange={(e) => setF({ ...f, en: e.target.value })} /></Field>
        <Field label="Example sentence"><textarea rows={2} value={f.example} onChange={(e) => setF({ ...f, example: e.target.value })} lang="fr" /></Field>
        <Field label="Personal notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <button className="btn primary block" disabled={!f.fr.trim() || dup}>Save</button>
        {onDelete && <button type="button" className="btn danger block" onClick={onDelete}>Delete</button>}
      </form>
    </Sheet>
  );
}
