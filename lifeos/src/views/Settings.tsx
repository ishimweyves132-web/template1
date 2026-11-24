import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { Card, Field, PageHead } from "../ui/kit";
import { createBackup, downloadJson, restoreBackup, takeSnapshot, validateBackup, type Snapshot } from "../lib/backup";
import { clearKey, keyInfo, loadKey, saveKey } from "../lib/aikey";
import { listModels } from "../lib/gemini";
import { fmtSize, storageUsed } from "../lib/attachments";
import { DATA_STORES } from "../lib/db";
import { formatDate, hmToMin, minToHM, todayStr } from "../lib/dates";

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export function Settings() {
  const { settings, setSettings, db, notify, reload, loadDemo, commitments, commit, objectives } = useApp(); const r = settings.rules;
  const [snaps, setSnaps] = useState<Snapshot[]>([]); const [err, setErr] = useState(""); const [pending, setPending] = useState<Awaited<ReturnType<typeof validateBackup>> | null>(null); const file = useRef<HTMLInputElement>(null);
  const [gw, setGw] = useState(settings.aiGatewayUrl); const [keyIn, setKeyIn] = useState(""); const [info, setInfo] = useState<{ last4: string; savedAt: number } | null>(null); const [models, setModels] = useState<string[]>([]); const [aiMsg, setAiMsg] = useState<{ ok: boolean; t: string } | null>(null); const [busyAi, setBusyAi] = useState(false); const [withFiles, setWithFiles] = useState(false); const [used, setUsed] = useState({ count: 0, bytes: 0 }); const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const loadSnaps = () => db.getAll<Snapshot>("snapshots").then((a) => setSnaps(a.sort((x, y) => y.at - x.at)));
  const refresh = () => { void keyInfo(db).then(setInfo); void storageUsed(db).then(setUsed); };
  useEffect(() => { void loadSnaps(); refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const rule = (p: Partial<typeof r>) => setSettings({ rules: { ...r, ...p } });
  const hoursBad = r.workEnd <= r.workStart; const gwBad = gw !== "" && !/^https:\/\//.test(gw) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(gw);
  const importedCount = commitments.filter((c) => c.source === "ics").length;
  return (
    <div>
      <PageHead title="Settings" sub="Your rules decide what LifeOS may do on its own." />
      <div className="cols">
        <div>
          <Card title="Scheduling rules">
            <div className="row2"><Field label="Working day starts" error={hoursBad ? "Must be before the end" : ""}><input type="time" value={minToHM(r.workStart)} onChange={(e) => rule({ workStart: hmToMin(e.target.value) })} /></Field><Field label="Working day ends"><input type="time" value={minToHM(r.workEnd)} onChange={(e) => rule({ workEnd: hmToMin(e.target.value) })} /></Field></div>
            <p className="small muted" style={{ margin: "0 0 6px" }}>Days tasks may be scheduled</p>
            <div className="row wrap" style={{ marginBottom: 14 }}>{WD.map((d, i) => <button key={d} className={`chip ${r.allowedDays.includes(i) ? "on" : ""}`} aria-pressed={r.allowedDays.includes(i)} onClick={() => rule({ allowedDays: r.allowedDays.includes(i) ? r.allowedDays.filter((x) => x !== i) : [...r.allowedDays, i].sort() })}>{d}</button>)}</div>
            <div className="row2"><Field label="Maximum planned hours per day"><input inputMode="decimal" value={r.maxDailyMin / 60} onChange={(e) => { const h = Number(e.target.value); if (h > 0 && h <= 16) rule({ maxDailyMin: Math.round(h * 60) }); }} /></Field><Field label="Buffer around events (min)"><input inputMode="numeric" value={r.bufferMin} onChange={(e) => { const m = Number(e.target.value.replace(/\D/g, "")); if (m <= 60) rule({ bufferMin: m }); }} /></Field></div>
            <label className="row" style={{ margin: "4px 0 12px" }}><input type="checkbox" checked={r.autoReschedule} onChange={(e) => rule({ autoReschedule: e.target.checked })} /><span><b className="small">Reschedule missed tasks automatically</b><br /><span className="small muted">Only inside these rules. Never touches calendar events, fixed or protected tasks, completed work or deadlines.</span></span></label>
            {r.autoReschedule && <div className="row2"><Field label="Max automatic moves per task"><input inputMode="numeric" value={r.maxAutoMoves} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n <= 10) rule({ maxAutoMoves: n }); }} /></Field><Field label="Max days to postpone"><input inputMode="numeric" value={r.maxPostponeDays} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n >= 1 && n <= 60) rule({ maxPostponeDays: n }); }} /></Field></div>}
          </Card>
          <Card title="Appearance and reminders">
            <Field label="Theme"><select value={settings.theme} onChange={(e) => setSettings({ theme: e.target.value as "system" | "light" | "dark" })}><option value="system">Follow my device</option><option value="light">Light</option><option value="dark">Dark</option></select></Field>
            <label className="row" style={{ margin: "0 0 8px" }}><input type="checkbox" checked={settings.remindersEnabled} onChange={async (e) => { const on = e.target.checked; if (on && typeof Notification !== "undefined" && Notification.permission === "default") setPerm(await Notification.requestPermission()); await setSettings({ remindersEnabled: on }); }} /><span className="small"><b>Remind me before scheduled tasks</b></span></label>
            <Field label="Minutes before"><input inputMode="numeric" value={settings.reminderLeadMin} onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); if (n <= 120) setSettings({ reminderLeadMin: n }); }} /></Field>
            <p className="small muted">Notifications: {perm}. In the browser, reminders appear while LifeOS is open or running in the background. Reliable reminders with the app closed need the Android app build (planned).</p>
          </Card>
          <Card title="AI assistant (optional)">
            <Field label="Provider"><select value={settings.aiProvider} onChange={(e) => setSettings({ aiProvider: e.target.value as "gemini" | "gateway" })}><option value="gemini">Google Gemini (my own key)</option><option value="gateway">My own gateway server</option></select></Field>
            {settings.aiProvider === "gemini" ? <>
              {info ? <p className="small"><b>Key saved</b> (ends …{info.last4}). <button className="btn ghost small" onClick={async () => { if (confirm("Remove the saved key from this device?")) { await clearKey(db); setModels([]); setAiMsg(null); refresh(); notify("Key removed"); } }}>Remove key</button></p>
                : <><Field label="Paste your Gemini API key" hint="Get one in Google AI Studio. It is stored encrypted on this device and sent only to Google."><input type="password" autoComplete="off" spellCheck={false} value={keyIn} onChange={(e) => setKeyIn(e.target.value)} placeholder="Paste here" /></Field>
                  <button className="btn small primary" disabled={keyIn.trim().length < 20} onClick={async () => { try { await saveKey(db, keyIn); setKeyIn(""); refresh(); setAiMsg({ ok: true, t: "Key saved. Now tap “Test key and load models”." }); } catch (e) { setAiMsg({ ok: false, t: (e as Error).message }); } }}>Save key</button></>}
              {info && <div style={{ marginTop: 10 }}><button className="btn small" disabled={busyAi} onClick={async () => { setBusyAi(true); setAiMsg(null); try { const k = await loadKey(db); if (!k) throw new Error("The saved key could not be read. Remove it and paste it again."); const m = await listModels(k); if (!m.length) throw new Error("This key works but has no text models available."); setModels(m); if (!settings.geminiModel || !m.includes(settings.geminiModel)) await setSettings({ geminiModel: m[0]! }); setAiMsg({ ok: true, t: `Key works. ${m.length} models available.` }); } catch (e) { setAiMsg({ ok: false, t: (e as Error).message }); } setBusyAi(false); }}>{busyAi ? "Testing…" : "Test key and load models"}</button></div>}
              {(models.length > 0 || settings.geminiModel) && <Field label="Model"><select value={settings.geminiModel} onChange={(e) => setSettings({ geminiModel: e.target.value })}>{[...new Set([settings.geminiModel, ...models].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>}
              {aiMsg && <p className="small" style={{ color: aiMsg.ok ? "var(--good)" : "var(--warn)" }} role="status">{aiMsg.t}</p>}
              <p className="small muted">Requests go directly from this device to Google. Your key is never put in backups or safety copies, and is not shown again. Treat it like a password: use a key you can revoke, restrict it to your LifeOS address in Google's console if you can, and do not use this on a shared device. Check Google's terms for your plan: on some plans, prompts may be used to improve Google's products.</p></> : <>
              <Field label="Your gateway address" error={gwBad ? "Must start with https://" : ""} hint="A server you control that holds the provider key and returns {operations:[…]}. Never put a key here."><input value={gw} onChange={(e) => setGw(e.target.value)} onBlur={() => !gwBad && setSettings({ aiGatewayUrl: gw.trim() })} placeholder="https://…" /></Field></>}
            <p className="small muted">The assistant only sends task titles, durations, deadlines, objective titles and free time windows. It never sends notes, evidence, attached files or calendar event titles, and its answers are validated against your rules before anything can change.</p>
          </Card>
        </div>
        <div>
          <Card title="Your data">
            <p className="small muted">Everything lives on this device. {settings.lastBackupAt ? `Last backup file: ${formatDate(new Date(settings.lastBackupAt).toISOString().slice(0, 10), { day: "numeric", month: "long" })}.` : "No backup file yet."}</p>
            <label className="row" style={{ margin: "0 0 10px" }}><input type="checkbox" checked={withFiles} onChange={(e) => setWithFiles(e.target.checked)} /><span className="small">Include attached files ({used.count} file{used.count === 1 ? "" : "s"}, {fmtSize(used.bytes)}: the backup file will be about {fmtSize(Math.round(used.bytes * 1.34))} larger)</span></label>
            <div className="row wrap"><button className="btn" onClick={async () => { downloadJson(`lifeos-backup-${todayStr()}.json`, await createBackup(db, { attachments: withFiles })); await setSettings({ lastBackupAt: Date.now() }); notify(withFiles ? "Backup file saved, with attachments" : "Backup file saved (without attachments)"); }}>Export backup</button><button className="btn" onClick={() => file.current?.click()}>Restore from file…</button></div>
            <input ref={file} type="file" accept=".json,application/json" hidden onChange={async (e) => { setErr(""); setPending(null); const f = e.target.files?.[0]; if (!f) return; try { setPending(await validateBackup(JSON.parse(await f.text()))); } catch (x) { setErr(x instanceof SyntaxError ? "That file is not valid JSON." : (x as Error).message); } if (file.current) file.current.value = ""; }} />
            {err && <p className="small" style={{ color: "var(--warn)" }} role="alert">{err}</p>}
            {pending && <div className="insight note"><b>Valid backup from {pending.exportedAt.slice(0, 10)}</b><p className="small">{(pending.data.tasks ?? []).length} tasks, {(pending.data.objectives ?? []).length} objectives{pending.attachments ? `, ${pending.attachments.length} attached files` : ", no attached files (your current attachments are kept)"}. Restoring replaces your current data; a safety copy is taken first.</p><button className="btn danger small" onClick={async () => { await restoreBackup(db, pending); await reload(); await loadSnaps(); refresh(); setPending(null); notify("Backup restored"); }}>Replace my data</button></div>}
          </Card>
          <Card title="Safety copies">
            <p className="small muted">Kept automatically before any restore, erase or example load. The last 5 stay on this device.</p>
            <div className="row wrap"><button className="btn small" onClick={async () => { await takeSnapshot(db, "manual"); await loadSnaps(); notify("Safety copy created"); }}>Create one now</button></div>
            <ul className="list">{snaps.map((s) => <li key={s.id}><div className="row"><span className="grow small">{new Date(s.at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}<br /><span className="muted">{s.reason}</span></span><button className="btn small" onClick={async () => { if (confirm("Restore this safety copy? Current data is saved as another copy first.")) { await restoreBackup(db, s.backup, "before restoring a safety copy"); await reload(); await loadSnaps(); notify("Restored"); } }}>Restore</button></div></li>)}</ul>
          </Card>
          <Card title="Calendar and examples">
            <p className="small muted">{importedCount} imported calendar event{importedCount === 1 ? "" : "s"}.</p>
            <div className="row wrap"><button className="btn small" disabled={!importedCount} onClick={async () => { if (confirm("Remove imported calendar events? Your own commitments stay.")) { await commit({ del: { commitments: commitments.filter((c) => c.source === "ics").map((c) => c.id) } }); notify("Imported events removed"); } }}>Remove imported events</button>
              <button className="btn small" disabled={objectives.length > 0} onClick={loadDemo}>Load an example plan</button></div>
            <button className="btn danger block" onClick={async () => { if (confirm("Erase ALL your LifeOS data from this device?") && confirm("This cannot be undone except from a safety copy. Erase everything?")) { await takeSnapshot(db, "before erase"); const empty: Record<string, unknown[]> = { files: [] }; for (const s of DATA_STORES) empty[s] = []; await db.replaceStores(empty); await reload(); refresh(); await loadSnaps(); notify("All data erased. A safety copy was kept."); } }}>Erase all data…</button>
          </Card>
          <Card title="About this version">
            <p className="small muted">LifeOS runs entirely on your device and works offline. Calendars connect through .ics files (import and export): direct Google Calendar and Android device-calendar sync need the native Android app, which is planned. Times are local wall-clock; travelling across time zones is not adjusted. The coach is rule-based; no AI is bundled.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
