import { useState } from "react";
import { useApp } from "../store";
import { ACTIVITY_LABEL, type Activity, type Session } from "../lib/model";
import { Field, Sheet, ActivitySelect } from "../ui/kit";
import { isDateStr, type DateStr } from "../lib/dates";

export interface SessionDraft { id?: string; date: DateStr; activity: Activity; minutes: number; learned?: string; difficulties?: string; notes?: string; source?: Session["source"] }

export function SessionSheet({ draft, onClose, onSaved, title }: { draft: SessionDraft; onClose: () => void; onSaved?: () => void; title?: string }) {
  const { saveSession, today, notify } = useApp();
  const [f, setF] = useState({ ...draft, learned: draft.learned ?? "", difficulties: draft.difficulties ?? "", notes: draft.notes ?? "" });
  const [mins, setMins] = useState(String(draft.minutes || ""));
  const [busy, setBusy] = useState(false);
  const m = Number(mins);
  const valid = Number.isInteger(m) && m > 0 && m <= 1440 && isDateStr(f.date) && f.date <= today;
  const err = !mins ? "" : !Number.isInteger(m) || m <= 0 ? "Enter whole minutes, 1 or more." : m > 1440 ? "That is more than a day." : f.date > today ? "Date cannot be in the future." : "";
  return (
    <Sheet title={title ?? (draft.id ? "Edit session" : "Add practice")} onClose={onClose}>
      <form onSubmit={async (e) => {
        e.preventDefault(); if (!valid || busy) return; setBusy(true);
        try { await saveSession({ ...f, minutes: m }); notify(`Saved ${m} min of ${ACTIVITY_LABEL[f.activity].toLowerCase()}`); onSaved?.(); onClose(); } catch { setBusy(false); }
      }}>
        <Field label="Activity"><ActivitySelect value={f.activity} onChange={(activity) => setF({ ...f, activity })} /></Field>
        <div className="row2">
          <Field label="Minutes practised" hint={err}><input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 12" aria-invalid={!!err} /></Field>
          <Field label="Date"><input type="date" max={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Field label="What I learned"><textarea rows={2} value={f.learned} onChange={(e) => setF({ ...f, learned: e.target.value })} /></Field>
        <Field label="Difficulties"><textarea rows={2} value={f.difficulties} onChange={(e) => setF({ ...f, difficulties: e.target.value })} /></Field>
        <Field label="Notes"><textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <button className="btn primary block" disabled={!valid || busy}>Save</button>
      </form>
    </Sheet>
  );
}
