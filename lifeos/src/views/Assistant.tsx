import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { Card } from "../ui/kit";
import { loadKey } from "../lib/aikey";
import { geminiChat } from "../lib/gemini";
import { nowMin } from "../lib/dates";
import { runAgent, runSummary, undoRun, type RunDeps } from "../domain/agentRunner";
import { TOOLS } from "../domain/agent";
import { uid, type AiRun, type ChatMsg } from "../lib/model";

export const QUICK = ["Plan my day", "Plan my week", "What did I miss? Fix it within my rules", "Turn my biggest long-term goal into yearly, monthly and weekly steps", "Review my progress and adjust what is not working"];
export const STARTERS = ["I want to speak French at B2 in two years, run a 10 km race by spring, and read 20 minutes every evening.", "Next month I'm moving house and need to keep my training going. Plan around that.", "I finished my 5 km run and read 30 pages today."];

/** Browser speech-to-text, where the browser supports it (Chrome, Edge, Android WebView). Returns null otherwise. */
export function startDictation(onText: (t: string) => void, onEnd: () => void): (() => void) | null {
  const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition; if (!Ctor) return null;
  const r = new Ctor(); r.lang = navigator.language || "en-GB"; r.continuous = false; r.interimResults = false;
  r.onresult = (e) => { const t = Array.from({ length: e.results.length }, (_, i) => e.results[i]![0]!.transcript).join(" ").trim(); if (t) onText(t); };
  r.onerror = () => onEnd(); r.onend = () => onEnd(); r.start();
  return () => r.stop();
}
interface SR { lang: string; continuous: boolean; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: () => void; onend: () => void; start: () => void; stop: () => void }
export const dictationSupported = () => { const W = window as unknown as Record<string, unknown>; return !!(W.SpeechRecognition || W.webkitSpeechRecognition); };

/** Everything the assistant needs to send a request and undo it. Shared by the Today capture box and the Assistant page. */
export function useAssistant() {
  const { db, settings, chat, aiRuns, today, getData, getSettings, context, commit, setSettings, notify } = useApp();
  const [busy, setBusy] = useState(false); const [hasKey, setHasKey] = useState<boolean | null>(null);
  useEffect(() => { void loadKey(db).then((k) => setHasKey(!!k)); }, [db, settings]);
  const ready = settings.aiProvider === "gemini" && hasKey === true && !!settings.geminiModel && settings.aiConsent;
  const msgs = [...chat].sort((a, b) => a.at - b.at); const runOf = (id: string | null) => aiRuns.find((r) => r.id === id);
  const deps = (key: string): RunDeps => ({
    getData, getSettings, today, nowMin, context, commit: (w) => commit(w as never), patchSettings: (p) => setSettings(p),
    model: (system, contents) => geminiChat({ key, model: getSettings().geminiModel, system, contents, tools: TOOLS }),
  });
  const send = async (prompt: string): Promise<boolean> => {
    const q = prompt.trim(); if (!q || busy || !ready) return false; setBusy(true);
    const um: ChatMsg = { id: uid(), role: "user", text: q, at: Date.now(), runId: null }; await commit({ put: { chat: [um] } });
    try {
      const key = await loadKey(db); if (!key) throw new Error("The saved key could not be read. Paste it again in Settings.");
      const { reply, run } = await runAgent(q, getData().chat.filter((m) => m.id !== um.id).sort((a, b) => a.at - b.at), deps(key));
      const am: ChatMsg = { id: uid(), role: "assistant", text: reply, at: Date.now() + 1, runId: run.actions.length ? run.id : null };
      await commit({ put: { chat: [am], ...(run.actions.length ? { aiRuns: [run] } : {}) } });
    } catch (e) { await commit({ put: { chat: [{ id: uid(), role: "assistant", text: `⚠ ${(e as Error).message} Nothing was changed.`, at: Date.now() + 1, runId: null }] } }); }
    setBusy(false); return true;
  };
  const undo = async (r: AiRun) => { if (!confirm(`Undo everything from this request (${runSummary(r)})? Records it touched go back exactly as they were.`)) return; await undoRun(r, { commit: (w) => commit(w as never), patchSettings: (p) => setSettings(p) }); await commit({ put: { aiRuns: [{ ...r, undone: true }] } }); notify("Undone"); };
  return { ready, hasKey, busy, send, undo, msgs, runOf, settings, setSettings, commit, chat };
}

/** Shown wherever the assistant is used but not yet set up: key, model and the explicit data-consent switch. */
export function AssistantSetup({ hasKey, consent, onConsent }: { hasKey: boolean | null; consent: boolean; onConsent: (v: boolean) => void }) {
  return (
    <Card title="Turn on the assistant">
      <p className="small">Tell LifeOS what you want in plain words, or speak it. The assistant reads your whole plan, then creates goals at any horizon, tasks, habits and this week's calendar for you. Every request can be undone.</p>
      <ol className="small" style={{ paddingLeft: 18 }}>
        <li style={{ margin: "6px 0" }}>{hasKey ? "✓" : "○"} Paste your Gemini API key and choose a model in Settings.</li>
        <li style={{ margin: "6px 0" }}>{consent ? "✓" : "○"} Allow it to read your data:</li>
      </ol>
      <a className="btn small" href="#/settings">Open Settings</a>
      <label className="row" style={{ margin: "10px 0 0" }}><input type="checkbox" checked={consent} onChange={(e) => onConsent(e.target.checked)} /><span className="small">I understand that while I use the assistant, my goals, tasks, calendar titles, notes, evidence text and history are sent to Google Gemini with my own API key.</span></label>
    </Card>
  );
}

/** The main way to use LifeOS: one box on Today. Type or speak anything; the latest result and its Undo stay visible here. */
export function Capture({ onOpenChat }: { onOpenChat?: () => void }) {
  const a = useAssistant(); const [text, setText] = useState(""); const [listening, setListening] = useState(false); const stop = useRef<(() => void) | null>(null);
  const { objectives, tasks } = useApp(); const fresh = objectives.length === 0 && tasks.length === 0;
  const last = a.msgs.filter((m) => m.role === "assistant").at(-1); const lastRun = last?.runId ? a.runOf(last.runId) : undefined;
  const go = async (t: string) => { if (await a.send(t)) setText(""); };
  const mic = () => {
    if (listening) { stop.current?.(); return; }
    setListening(true); stop.current = startDictation((t) => setText((x) => (x ? x + " " : "") + t), () => { setListening(false); stop.current = null; });
  };
  if (!a.ready) return <AssistantSetup hasKey={a.hasKey} consent={a.settings.aiConsent} onConsent={(v) => void a.setSettings({ aiConsent: v })} />;
  return (
    <Card title={fresh ? "Describe your life" : "Tell LifeOS"} action={onOpenChat && a.msgs.length > 0 ? <button className="btn ghost small" onClick={onOpenChat}>Conversation</button> : undefined}>
      {fresh && <p className="small muted">Say what you want, in your own words. LifeOS sets up the goals, the time frames, the habits and this week's plan.</p>}
      <textarea aria-label="Tell LifeOS anything" rows={3} value={text} disabled={a.busy} placeholder={fresh ? STARTERS[0] : "e.g. I finished my run, or: plan my next two weeks around my dentist visit"} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void go(text); } }} />
      <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
        <button className="btn primary" disabled={a.busy || !text.trim()} onClick={() => void go(text)}>{a.busy ? "Working on it…" : "Do it"}</button>
        {dictationSupported() && <button className={`btn ${listening ? "danger" : ""}`} onClick={mic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak instead of typing"}>{listening ? "● Listening…" : "🎙 Speak"}</button>}
        {fresh && <button className="btn small" disabled={a.busy} onClick={() => setText(STARTERS[0]!)}>Use an example</button>}
      </div>
      {!text && !a.busy && <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>{QUICK.slice(0, 3).map((q) => <button key={q} className="btn small" disabled={a.busy} onClick={() => void go(q)}>{q}</button>)}</div>}
      {a.busy && <p className="small muted" role="status" style={{ marginTop: 10 }}>Reading your plan, then making the changes…</p>}
      {last && !a.busy && <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <p className="small" style={{ whiteSpace: "pre-wrap" }}>{last.text}</p>
        {lastRun && <><p className="small muted" style={{ margin: "6px 0 0" }}><b>{lastRun.undone ? "Undone — " : ""}{runSummary(lastRun)}</b></p>
          <ul className="list small" style={{ margin: "4px 0" }}>{lastRun.actions.map((x, i) => <li key={i} style={{ color: x.ok ? undefined : "var(--warn)" }}>{x.ok ? "✓" : "✗"} {x.summary}</li>)}</ul>
          {!lastRun.undone && lastRun.undo.length > 0 && <button className="btn small" onClick={() => void a.undo(lastRun)}>Undo this request</button>}</>}
      </div>}
    </Card>
  );
}

export function Assistant() {
  const a = useAssistant(); const [text, setText] = useState(""); const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView?.({ block: "end" }); }, [a.chat.length, a.busy]);
  if (!a.ready) return <AssistantSetup hasKey={a.hasKey} consent={a.settings.aiConsent} onConsent={(v) => void a.setSettings({ aiConsent: v })} />;
  return (
    <Card title="Conversation">
      <div className="chat" role="log" aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: "52vh", overflowY: "auto", padding: "2px 0 8px" }}>
        {a.msgs.length === 0 && <p className="small muted">Everything you ask is kept here, with an Undo for each request that changed your plan.</p>}
        {a.msgs.map((m) => { const r = a.runOf(m.runId); return (
          <div key={m.id} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "92%" }}>
            <div className="small" style={{ background: m.role === "user" ? "var(--sage-d)" : "var(--raised)", color: m.role === "user" ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 14, padding: "9px 13px", whiteSpace: "pre-wrap" }}>{m.text}</div>
            {r && <div className="small muted" style={{ marginTop: 6 }}>
              <b>{r.undone ? "Undone — " : ""}{runSummary(r)}</b>
              <ul className="list" style={{ margin: "4px 0" }}>{r.actions.map((x, i) => <li key={i} style={{ color: x.ok ? undefined : "var(--warn)" }}>{x.ok ? "✓" : "✗"} {x.summary}</li>)}</ul>
              {!r.undone && r.undo.length > 0 && <button className="btn small" onClick={() => void a.undo(r)}>Undo this request</button>}
            </div>}
          </div>); })}
        {a.busy && <div className="small muted" role="status">Working on it… (reading your data, then making changes)</div>}
        <div ref={end} />
      </div>
      <div className="row wrap" style={{ gap: 6, margin: "8px 0" }}>{QUICK.map((q) => <button key={q} className="btn small" disabled={a.busy} onClick={async () => { await a.send(q); }}>{q}</button>)}</div>
      <form onSubmit={async (e) => { e.preventDefault(); if (await a.send(text)) setText(""); }}>
        <label className="small" htmlFor="ask">Tell or ask your assistant</label>
        <textarea id="ask" rows={2} value={text} disabled={a.busy} onChange={(e) => setText(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (await a.send(text)) setText(""); } }} placeholder="e.g. Add a goal to read 12 books this year and schedule the first week" />
        <div className="row wrap" style={{ marginTop: 8 }}><button className="btn primary" disabled={a.busy || !text.trim()}>{a.busy ? "Working…" : "Send"}</button>{a.chat.length > 0 && <button type="button" className="btn ghost small" disabled={a.busy} onClick={async () => { if (confirm("Clear this conversation? Your plan stays as it is; the Undo buttons for earlier requests go away.")) { await a.commit({ del: { chat: a.chat.map((m) => m.id) } }); } }}>Clear conversation</button>}</div>
      </form>
    </Card>
  );
}
