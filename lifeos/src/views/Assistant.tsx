import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { Card } from "../ui/kit";
import { loadKey } from "../lib/aikey";
import { geminiChat } from "../lib/gemini";
import { nowMin } from "../lib/dates";
import { runAgent, runSummary, undoRun, type RunDeps } from "../domain/agentRunner";
import { TOOLS } from "../domain/agent";
import { uid, type AiRun, type ChatMsg } from "../lib/model";

const QUICK = ["Plan my week around my goals", "I'm behind: what should I drop or move?", "Turn my top goal into key results and tasks, then schedule them", "Add a 1-hour deep-work block every weekday morning", "What did I get done this week?"];

export function Assistant() {
  const { db, settings, chat, aiRuns, today, getData, getSettings, context, commit, setSettings, notify } = useApp();
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [hasKey, setHasKey] = useState<boolean | null>(null); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { void loadKey(db).then((k) => setHasKey(!!k)); }, [db, settings]);
  const msgs = [...chat].sort((a, b) => a.at - b.at); const runOf = (id: string | null) => aiRuns.find((r) => r.id === id);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [chat.length, busy]);
  const ready = settings.aiProvider === "gemini" && hasKey === true && !!settings.geminiModel && settings.aiConsent;

  const deps = (key: string): RunDeps => ({
    getData, getSettings, today, nowMin, context, commit: (w) => commit(w as never), patchSettings: (p) => setSettings(p),
    model: (system, contents) => geminiChat({ key, model: getSettings().geminiModel, system, contents, tools: TOOLS }),
  });
  const send = async (prompt: string) => {
    const q = prompt.trim(); if (!q || busy || !ready) return; setBusy(true); setText("");
    const um: ChatMsg = { id: uid(), role: "user", text: q, at: Date.now(), runId: null }; await commit({ put: { chat: [um] } });
    try {
      const key = await loadKey(db); if (!key) throw new Error("The saved key could not be read. Paste it again in Settings.");
      const { reply, run } = await runAgent(q, getData().chat.filter((m) => m.id !== um.id).sort((a, b) => a.at - b.at), deps(key));
      const am: ChatMsg = { id: uid(), role: "assistant", text: reply, at: Date.now() + 1, runId: run.actions.length ? run.id : null };
      await commit({ put: { chat: [am], ...(run.actions.length ? { aiRuns: [run] } : {}) } });
    } catch (e) { await commit({ put: { chat: [{ id: uid(), role: "assistant", text: `⚠ ${(e as Error).message} Nothing was changed.`, at: Date.now() + 1, runId: null }] } }); }
    setBusy(false);
  };
  const undo = async (r: AiRun) => { if (!confirm(`Undo everything from this request (${runSummary(r)})? Records it touched go back exactly as they were.`)) return; await undoRun(r, { commit: (w) => commit(w as never), patchSettings: (p) => setSettings(p) }); await commit({ put: { aiRuns: [{ ...r, undone: true }] } }); notify("Undone"); };

  if (!ready) return (
    <Card title="Set up your assistant">
      <p className="small">Your assistant reads <b>all</b> of your LifeOS data and does the work itself: it creates goals, key results and tasks, schedules them, logs progress and changes your plan. Every request can be undone.</p>
      <ol className="small" style={{ paddingLeft: 18 }}>
        <li style={{ margin: "6px 0" }}>{hasKey ? "✓" : "○"} Paste your Gemini API key and choose a model in Settings → AI assistant.</li>
        <li style={{ margin: "6px 0" }}>{settings.aiConsent ? "✓" : "○"} Allow it to receive your data:</li>
      </ol>
      <a className="btn small" href="#/settings">Open Settings</a>
      <label className="row" style={{ margin: "0 0 8px" }}><input type="checkbox" checked={settings.aiConsent} onChange={(e) => void setSettings({ aiConsent: e.target.checked })} /><span className="small">I understand that while I use the assistant, my goals, tasks, calendar titles, notes, evidence text and history are sent to Google Gemini with my own API key.</span></label>
      {settings.aiProvider !== "gemini" && <p className="small" style={{ color: "var(--warn)" }}>The assistant needs the Gemini provider. Switch it in Settings.</p>}
    </Card>
  );
  return (
    <Card title="Assistant">
      <div className="chat" role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "52vh", overflowY: "auto", padding: "2px 0 8px" }}>
        {msgs.length === 0 && <p className="small muted">Tell it what you want in plain words. It sees your whole plan and makes the changes itself.</p>}
        {msgs.map((m) => { const r = runOf(m.runId); return (
          <div key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%" }}>
            <div className="small" style={{ background: m.role === "user" ? "var(--sage-d)" : "var(--raised)", color: m.role === "user" ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 14, padding: "9px 13px", whiteSpace: "pre-wrap" }}>{m.text}</div>
            {r && <div className="small muted" style={{ marginTop: 6 }}>
              <b>{r.undone ? "Undone — " : ""}{runSummary(r)}</b>
              <ul className="list" style={{ margin: "4px 0" }}>{r.actions.map((a, i) => <li key={i} style={{ color: a.ok ? undefined : "var(--warn)" }}>{a.ok ? "✓" : "✗"} {a.summary}</li>)}</ul>
              {!r.undone && r.undo.length > 0 && <button className="btn small" onClick={() => void undo(r)}>Undo this request</button>}
            </div>}
          </div>); })}
        {busy && <div className="small muted" role="status">Working on it… (reading your data, then making changes)</div>}
        <div ref={end} />
      </div>
      <div className="row wrap" style={{ gap: 6, margin: "8px 0" }}>{QUICK.map((q) => <button key={q} className="btn small" disabled={busy} onClick={() => void send(q)}>{q}</button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); void send(text); }}>
        <label className="small" htmlFor="ask">Ask or tell your assistant</label>
        <textarea id="ask" rows={2} value={text} disabled={busy} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} placeholder="e.g. Add a goal to read 12 books this year and schedule the first week" />
        <div className="row wrap" style={{ marginTop: 8 }}><button className="btn primary" disabled={busy || !text.trim()}>{busy ? "Working…" : "Send"}</button>{msgs.length > 0 && <button type="button" className="btn ghost small" disabled={busy} onClick={async () => { if (confirm("Clear this conversation? Your data and the Undo buttons for earlier requests are kept only until you clear.")) { await commit({ del: { chat: chat.map((m) => m.id) } }); } }}>Clear conversation</button>}</div>
      </form>
    </Card>
  );
}
