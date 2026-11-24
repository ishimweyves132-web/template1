import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { downloadBlob } from "../lib/backup";
import { fmtSize, loadAttachment, PREVIEWABLE, removeAttachment, saveAttachment } from "../lib/attachments";
import { uid, type Evidence } from "../lib/model";
import { formatDate } from "../lib/dates";

/** Hidden file input behind a button. Validation errors are shown, never swallowed. */
export function AttachButton({ onFile, label = "Attach a file" }: { onFile: (f: File) => void | Promise<void>; label?: string }) {
  const ref = useRef<HTMLInputElement>(null); const { notify } = useApp();
  return (<><button type="button" className="btn small" onClick={() => ref.current?.click()}>{label}</button>
    <input ref={ref} type="file" hidden aria-label={label} onChange={async (e) => { const f = e.target.files?.[0]; if (ref.current) ref.current.value = ""; if (f) { try { await onFile(f); } catch (x) { notify((x as Error).message); } } }} /></>);
}
/** Saves the file and links it to an objective / occurrence as evidence. If linking fails the file is removed again. */
export function useAddFileEvidence() {
  const { db, commit, notify } = useApp();
  return async (file: File, link: { objectiveId: string | null; occId: string | null }) => {
    const meta = await saveAttachment(db, file);
    const ev: Evidence = { id: uid(), objectiveId: link.objectiveId, krId: null, occId: link.occId, kind: "file", text: meta.name, createdAt: Date.now(), fileId: meta.id, fileName: meta.name, mime: meta.mime, size: meta.size };
    try { await commit({ put: { evidence: [ev] } }); } catch (e) { await removeAttachment(db, meta.id); throw e; }
    notify(`Attached ${meta.name}`);
  };
}
function Thumb({ id, mime, name }: { id: string; mime: string; name: string }) {
  const { db } = useApp(); const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { let u: string | null = null, live = true; if (PREVIEWABLE.has(mime)) void loadAttachment(db, id).then((f) => { if (f && live) { u = URL.createObjectURL(f.blob); setUrl(u); } }); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [db, id, mime]);
  return url ? <img src={url} alt={`Preview of ${name}`} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }} /> : <span className="pill">{mime.split("/")[1]?.slice(0, 4).toUpperCase() || "FILE"}</span>;
}
export function EvidenceItems({ items }: { items: Evidence[] }) {
  const { db, commit, notify } = useApp();
  if (!items.length) return null;
  return (
    <ul className="list">{[...items].sort((a, b) => b.createdAt - a.createdAt).map((e) => (
      <li key={e.id}><div className="row">
        {e.kind === "file" && e.fileId ? <Thumb id={e.fileId} mime={e.mime ?? ""} name={e.fileName ?? e.text} /> : null}
        <div className="grow small">{e.kind === "link" ? <a href={e.text} target="_blank" rel="noopener noreferrer">{e.text}</a> : <b>{e.text}</b>}<div className="muted">{e.kind === "file" ? `${fmtSize(e.size ?? 0)} · ` : ""}{formatDate(new Date(e.createdAt).toISOString().slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</div></div>
        {e.kind === "file" && e.fileId && <button className="btn small" onClick={async () => { const f = await loadAttachment(db, e.fileId!); if (f) downloadBlob(f.name, f.blob); else notify("This attachment is not on this device (it was not in the backup you restored)."); }}>Download</button>}
        <button className="btn ghost small" aria-label={`Remove ${e.text}`} onClick={async () => { if (!confirm("Remove this evidence?")) return; await commit({ del: { evidence: [e.id] } }); if (e.fileId) await removeAttachment(db, e.fileId); }}>Remove</button>
      </div></li>))}</ul>
  );
}
