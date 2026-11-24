import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Db, DATA_STORES, type StoreName } from "./lib/db";
import { addDays, nowMin, todayStr, type DateStr } from "./lib/dates";
import { defaultSettings, uid, type AiRun, type ChatMsg, type AiAudit, type Area, type Change, type Commitment, type Evidence, type Execution, type Habit, type HabitLog, type KeyResult, type KrPoint, type Objective, type Occurrence, type Review, type Session, type Settings, type Task, type Vision } from "./lib/model";
import { approvePlacements, completeOccurrence, missingOccurrences, settleMissed, toggleHabit, type CompleteInput } from "./domain/ops";
import { recoverMissed, undoChange, type Recovery } from "./domain/reschedule";
import { proposeSchedule, type Busy, type Context, type Placement, type Unplaced } from "./domain/scheduler";
import { takeSnapshot } from "./lib/backup";
import { demoData } from "./lib/demo";

export interface Data { vision: Vision[]; areas: Area[]; objectives: Objective[]; krs: KeyResult[]; krPoints: KrPoint[]; tasks: Task[]; occurrences: Occurrence[]; sessions: Session[]; executions: Execution[]; habits: Habit[]; habitLogs: HabitLog[]; evidence: Evidence[]; commitments: Commitment[]; reviews: Review[]; changes: Change[]; aiAudit: AiAudit[]; chat: ChatMsg[]; aiRuns: AiRun[] }
const empty = (): Data => Object.fromEntries(DATA_STORES.map((s) => [s, []])) as unknown as Data;
export interface FocusState { occId: string; startedAt: number }
type Writes = { put?: { [K in StoreName]?: Data[K] }; del?: Partial<Record<StoreName, string[]>> };

interface Ctx extends Data {
  db: Db; today: DateStr; settings: Settings; focus: FocusState | null; toast: string; notify: (m: string) => void;
  commit: (w: Writes) => Promise<void>; setSettings: (p: Partial<Settings>) => Promise<void>;
  complete: (occId: string, input: CompleteInput) => Promise<void>;
  context: (extraSessions?: Session[], excludeOcc?: string) => Context;
  propose: (from: DateStr, to: DateStr) => { placements: Placement[]; unplaced: Unplaced[] };
  approve: (placements: Placement[], reason: string) => Promise<void>;
  recover: () => Promise<Recovery>; undo: (changeId: string) => Promise<string | null>;
  toggleHabitOn: (habitId: string, date: DateStr) => Promise<void>;
  startFocus: (occId: string) => Promise<void>; stopFocus: () => Promise<void>;
  loadDemo: () => Promise<void>; reload: () => Promise<void>;
  /** Always the latest data / settings (not a render snapshot): the assistant reads these between its own writes. */
  getData: () => Data; getSettings: () => Settings;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(C); if (!c) throw new Error("no store"); return c; };

export function Provider({ db, children }: { db: Db; children: ReactNode }) {
  const [data, setData] = useState<Data>(empty()); const [settings, setSettingsState] = useState<Settings>(defaultSettings());
  const [loaded, setLoaded] = useState(false); const [today, setToday] = useState(todayStr()); const [focus, setFocus] = useState<FocusState | null>(null);
  const [toast, setToast] = useState(""); const tt = useRef<number | undefined>(undefined);
  const ref = useRef(data); ref.current = data; const sref = useRef(settings); sref.current = settings;
  const notify = useCallback((m: string) => { setToast(m); clearTimeout(tt.current); tt.current = window.setTimeout(() => setToast(""), 4000); }, []);

  const reload = useCallback(async () => {
    const d = empty(); for (const s of DATA_STORES) (d as unknown as Record<string, unknown[]>)[s] = await db.getAll(s);
    setData(d); setSettingsState(await db.loadSettings()); setFocus((await db.getKv<FocusState>("focus")) ?? null); setLoaded(true);
  }, [db]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { const t = () => setToday(todayStr()); document.addEventListener("visibilitychange", t); const id = setInterval(t, 60_000); return () => { document.removeEventListener("visibilitychange", t); clearInterval(id); }; }, []);
  useEffect(() => { const th = settings.theme; document.documentElement.dataset.theme = th === "system" ? "" : th; }, [settings.theme]);

  /** One atomic database write, then the same change applied to memory. */
  const commit = useCallback(async (w: Writes) => {
    const puts = Object.entries(w.put ?? {}).flatMap(([s, rs]) => (rs ?? []).map((r) => [s, r] as [string, unknown])); const dels = Object.entries(w.del ?? {}).flatMap(([s, ids]) => (ids ?? []).map((id) => [s, id] as [string, string]));
    try { await db.write({ put: puts, del: dels }); } catch (e) { notify("Could not save to this device's storage. Free some space and try again."); throw e; }
    // Update the in-memory copy synchronously (not in a deferred state updater) so the very next operation, e.g. recovery right
    // after settling missed tasks, sees what was just written.
    const n = { ...ref.current } as unknown as Record<string, { id: string }[]>;
    for (const [s, rs] of Object.entries(w.put ?? {})) { const m = new Map(n[s]!.map((r) => [r.id, r])); (rs ?? []).forEach((r) => m.set(r.id, r)); n[s] = [...m.values()]; }
    for (const [s, ids] of Object.entries(w.del ?? {})) n[s] = n[s]!.filter((r) => !(ids ?? []).includes(r.id));
    ref.current = n as unknown as Data; setData(ref.current);
  }, [db, notify]);

  const context = useCallback((extra: Session[] = [], excludeOcc?: string): Context => {
    const d = ref.current; const live = new Set(d.occurrences.filter((o) => o.status === "planned" || o.status === "in-progress").map((o) => o.id));
    return { rules: sref.current.rules, today, now: nowMin(), busy: (date) => [
      ...d.commitments.filter((c) => c.date === date).map((c): Busy => ({ startMin: c.startMin, endMin: c.endMin, kind: c.source === "ics" ? "external" : c.protectedBlock ? "protected" : "commitment", id: c.id })),
      ...[...d.sessions, ...extra].filter((s) => s.date === date && s.state === "approved" && live.has(s.occId) && s.occId !== excludeOcc).map((s): Busy => ({ startMin: s.startMin, endMin: s.endMin, kind: "session", id: s.occId })),
    ] };
  }, [today]);

  // Day rollover / first load: create upcoming occurrences, record yesterday's unfinished work as missed, then recover within the approved rules.
  const settledFor = useRef("");
  useEffect(() => {
    if (!loaded || settledFor.current === today) return; settledFor.current = today;
    void (async () => {
      const d = ref.current; const fresh = missingOccurrences(d.tasks, d.occurrences, today, addDays(today, 21));
      const missed = settleMissed([...d.occurrences, ...fresh], today);
      if (fresh.length || missed.length) await commit({ put: { occurrences: [...fresh, ...missed] } });
      if (missed.length && sref.current.rules.autoReschedule) { const r = await recoverRef.current(); if (r.mutation.changes.length) notify(`${r.mutation.changes.length} missed task${r.mutation.changes.length === 1 ? "" : "s"} rescheduled within your rules. Review them in the Planner.`); }
    })();
  }, [loaded, today, commit, notify]);

  const setSettings = useCallback(async (p: Partial<Settings>) => { const n = { ...sref.current, ...p }; await db.saveSettings(n); setSettingsState(n); }, [db]);
  const complete = useCallback(async (id: string, input: CompleteInput) => {
    const d = ref.current; const occ = d.occurrences.find((o) => o.id === id); const task = occ && d.tasks.find((t) => t.id === occ.taskId); if (!occ || !task) return;
    const r = completeOccurrence(occ, task, input, today); await commit({ put: { occurrences: [r.occurrence], executions: [r.execution] } });
    if (focus?.occId === id) { await db.delKv("focus"); setFocus(null); }
  }, [commit, today, focus, db]);
  const propose = useCallback((from: DateStr, to: DateStr) => {
    const d = ref.current; const items = d.occurrences.filter((o) => o.status === "planned" && o.date <= to && !d.sessions.some((s) => s.occId === o.id && s.state === "approved" && s.date >= today)).flatMap((o) => { const t = d.tasks.find((x) => x.id === o.taskId); return t && t.status === "active" ? [{ occId: o.id, taskId: t.id, date: o.date < from ? from : o.date, estimateMin: t.estimateMin, priority: t.priority, deadline: t.deadline, earliestStart: t.earliestStart, preferred: t.preferred, flexibility: t.flexibility }] : []; });
    return proposeSchedule(items, context(), { from, to });
  }, [context, today]);
  const approve = useCallback(async (placements: Placement[], reason: string) => {
    const d = ref.current; const a = approvePlacements(placements, d.occurrences, d.sessions, reason);
    await commit({ put: { sessions: a.sessions, changes: a.changes, occurrences: a.occurrences } });
  }, [commit]);
  const recoverRef = useRef<() => Promise<Recovery>>(async () => ({ mutation: { sessions: [], occurrences: [], changes: [] }, needsApproval: [] }));
  const recover = useCallback(async () => {
    const d = ref.current; const missed = d.occurrences.filter((o) => o.status === "missed").flatMap((o) => { const t = d.tasks.find((x) => x.id === o.taskId); return t ? [{ occ: o, task: t, current: d.sessions.filter((s) => s.occId === o.id && s.state === "approved").sort((a, b) => b.createdAt - a.createdAt)[0] ?? null }] : []; });
    const r = recoverMissed(missed, context());
    if (r.mutation.changes.length) await commit({ put: { sessions: r.mutation.sessions, occurrences: r.mutation.occurrences, changes: r.mutation.changes } });
    return r;
  }, [commit, context]);
  recoverRef.current = recover;
  const undo = useCallback(async (id: string) => {
    const d = ref.current; const ch = d.changes.find((c) => c.id === id); const occ = ch && d.occurrences.find((o) => o.id === ch.occId); if (!ch || !occ) return "That change no longer exists.";
    const r = undoChange(ch, d.sessions, occ, d.changes); if (!r.ok) return r.reason;
    await commit({ put: { sessions: r.mutation.sessions, occurrences: r.mutation.occurrences, changes: r.mutation.changes } }); return null;
  }, [commit]);
  const toggleHabitOn = useCallback(async (habitId: string, date: DateStr) => {
    const d = ref.current; const h = d.habits.find((x) => x.id === habitId); if (!h) return; const r = toggleHabit(h, d.habitLogs, date);
    await commit({ put: r.add ? { habitLogs: [r.add] } : {}, del: r.remove ? { habitLogs: [r.remove.id] } : {} });
  }, [commit]);
  const startFocus = useCallback(async (occId: string) => { const f = { occId, startedAt: Date.now() }; await db.setKv("focus", f); setFocus(f); const o = ref.current.occurrences.find((x) => x.id === occId); if (o && o.status === "planned") await commit({ put: { occurrences: [{ ...o, status: "in-progress" }] } }); }, [db, commit]);
  const stopFocus = useCallback(async () => { await db.delKv("focus"); setFocus(null); }, [db]);
  const loadDemo = useCallback(async () => {
    await takeSnapshot(db, "before loading the example plan"); const e = demoData(today);
    await commit({ put: { vision: [e.vision], areas: e.areas, objectives: e.objectives, krs: e.krs, krPoints: e.krPoints, tasks: e.tasks, occurrences: e.occurrences, executions: e.executions, habits: e.habits, habitLogs: e.habitLogs, commitments: e.commitments } });
    notify("Example plan loaded. Erase it any time in Settings.");
  }, [db, commit, today, notify]);

  const value = useMemo<Ctx>(() => ({ ...data, db, today, settings, focus, toast, notify, commit, setSettings, complete, context, propose, approve, recover, undo, toggleHabitOn, startFocus, stopFocus, loadDemo, reload, getData: () => ref.current, getSettings: () => sref.current }), [data, db, today, settings, focus, toast, notify, commit, setSettings, complete, context, propose, approve, recover, undo, toggleHabitOn, startFocus, stopFocus, loadDemo, reload]);
  if (!loaded) return <div className="boot">Loading…</div>;
  return <C.Provider value={value}>{children}</C.Provider>;
}
export const newId = uid;
