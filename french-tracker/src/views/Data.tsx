import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { Card, Page, Field } from "../ui/kit";
import { createBackup, downloadJson, restoreBackup, takeSnapshot, validateBackup, type BackupFile, type Snapshot } from "../lib/backup";
import { todayStr, formatDate } from "../lib/dates";
import { isNative } from "../lib/native";

export function Data() {
  const { db, settings, updateSettings, notify, reload, sessions, vocab } = useApp();
  const [pending, setPending] = useState<BackupFile | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [err, setErr] = useState("");
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadSnaps = () => db.getAll<Snapshot>("snapshots").then((a) => setSnaps(a.sort((x, y) => y.at - x.at)));
  useEffect(() => { void loadSnaps(); void navigator.storage?.persisted?.().then(setPersisted); }, []); // eslint-disable-line

  const doExport = async () => {
    const f = await createBackup(db);
    try { await downloadJson(`french-tracker-backup-${todayStr()}.json`, f); } catch (e) { notify("Could not share the backup file."); return; }
    await updateSettings({ lastExportAt: Date.now() }); notify(isNative() ? "Choose where to save your backup" : "Backup file saved to your downloads");
  };
  const pick = async (file: File | undefined) => {
    setErr(""); setPending(null); if (!file) return;
    try { setPending(await validateBackup(JSON.parse(await file.text()))); }
    catch (e) { setErr(e instanceof SyntaxError ? "That file is not valid JSON." : (e as Error).message); }
    if (fileRef.current) fileRef.current.value = "";
  };
  const apply = async (mode: "replace" | "merge") => {
    if (!pending) return;
    if (mode === "replace" && !confirm("Replace ALL current data with this backup? A safety copy of your current data is saved first.")) return;
    try { await restoreBackup(db, pending, mode, mode === "replace" ? "before import (replace)" : "before import (merge)"); await reload(); setPending(null); await loadSnaps(); notify(mode === "replace" ? "Backup restored" : "Backup merged"); }
    catch (e) { setErr((e as Error).message); }
  };
  const days = settings.lastExportAt ? Math.floor((Date.now() - settings.lastExportAt) / 86400000) : null;

  return (
    <Page title="Data & backup" back="#/more">
      <Card title="Your data">
        <p>{sessions.length} sessions and {vocab.length} saved words, stored only on this device. No account, no server.</p>
        <p className="small muted">Storage protection: {persisted === null ? "unknown" : persisted ? "persistent (the browser will not clear it automatically)" : "not guaranteed — clearing browser data deletes records. Keep backup files."}
          {persisted === false && <> <button className="link" onClick={() => navigator.storage?.persist?.().then((p) => { setPersisted(p); notify(p ? "Storage is now protected" : "The browser declined; installing the app to your home screen usually helps"); })}>Request protection</button></>}</p>
      </Card>
      <Card title="Export backup">
        <p>Saves everything (sessions, targets, vocabulary, goals, challenge) to one file you can keep in Drive, email or on a computer. {days === null ? "You have not exported yet." : `Last export: ${days === 0 ? "today" : days + " day" + (days === 1 ? "" : "s") + " ago"}.`}</p>
        <button className="btn primary block" onClick={doExport}>Export backup file</button>
      </Card>
      <Card title="Import / restore">
        <Field label="Choose a backup file"><input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => pick(e.target.files?.[0])} /></Field>
        {err && <p className="error" role="alert">{err}</p>}
        {pending && (
          <div className="pending">
            <p><b>Valid backup</b> from {formatDate(pending.exportedAt.slice(0, 10), { day: "numeric", month: "long", year: "numeric" })}: {pending.data.sessions.length} sessions, {pending.data.vocab.length} words, {pending.data.goals.length} goals.</p>
            <button className="btn block" onClick={() => apply("merge")}>Merge — add only what is missing</button>
            <button className="btn danger block" onClick={() => apply("replace")}>Replace everything with this backup</button>
          </div>
        )}
      </Card>
      <Card title="Safety copies">
        <p className="muted">Taken automatically every week and before any import or reset. The last 5 are kept inside the app.</p>
        <button className="btn" onClick={async () => { await takeSnapshot(db, "manual"); await loadSnaps(); notify("Safety copy created"); }}>Create one now</button>
        <ul className="rows col">{snaps.map((s) => (
          <li key={s.id}><div className="sess"><span className="grow">{new Date(s.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}<small className="sub">{s.reason} · {s.backup.data.sessions.length} sessions</small></span>
            <button className="link" onClick={async () => { if (confirm("Restore this safety copy? Current data is saved as another safety copy first.")) { await restoreBackup(db, s.backup, "replace", "before restoring safety copy"); await reload(); await loadSnaps(); notify("Restored"); } }}>Restore</button></div></li>))}</ul>
      </Card>
      <Card title="Erase everything">
        <p className="muted">Removes all sessions, vocabulary, goals and challenges from this device. A safety copy is kept inside the app.</p>
        <button className="btn danger" onClick={async () => { if (confirm("Erase ALL your learning records?") && confirm("Really erase? Export a backup first if unsure. A safety copy will be kept in the app.")) { await takeSnapshot(db, "before erase"); await db.replaceStores({ sessions: [], marks: [], vocab: [], goals: [], challenges: [] }); await reload(); await loadSnaps(); notify("All records erased"); } }}>Erase all data…</button>
      </Card>
    </Page>
  );
}
