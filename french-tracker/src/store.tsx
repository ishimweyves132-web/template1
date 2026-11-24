import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Db } from "./lib/db";
import { takeSnapshot } from "./lib/backup";
import { addDays, diffDays, todayStr, type DateStr } from "./lib/dates";
import { markKey, uid, type Activity, type Challenge, type Goal, type Mark, type Session, type Settings, type VocabEntry, defaultSettings } from "./lib/model";
import { goalProgress } from "./lib/goals";
import { buildLedger, type Ledger } from "./lib/stats";
import { newChallenge } from "./lib/challenge";
import { installBundled, type DictProgress } from "./lib/dict";
import { isNative } from "./lib/native";

export type NewSession = Omit<Session, "id" | "createdAt" | "source"> & { source?: Session["source"] };

interface Ctx {
  db: Db; today: DateStr; ledger: Ledger;
  sessions: Session[]; marks: Mark[]; vocab: VocabEntry[]; goals: Goal[]; challenges: Challenge[]; settings: Settings;
  toast: string; notify: (m: string) => void;
  dictInstall: DictProgress | null;
  saveSession: (s: NewSession & { id?: string }) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  toggleMark: (date: DateStr, a: Activity) => Promise<void>;
  setTarget: (a: Activity, minutes: number) => Promise<void>;
  saveVocab: (v: Partial<VocabEntry> & { fr: string }) => Promise<VocabEntry>;
  deleteVocab: (id: string) => Promise<void>;
  reviewVocab: (id: string) => Promise<void>;
  saveGoal: (g: Goal) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  saveChallenge: (c: Challenge) => Promise<void>;
  startChallenge: (start: DateStr) => Promise<void>;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  startTimer: (a: Activity) => Promise<void>;
  clearTimer: () => Promise<void>;
  reload: () => Promise<void>;
}
const C = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(C); if (!c) throw new Error("no store"); return c; };

const byDate = (a: Session, b: Session) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

export function Provider({ db, children }: { db: Db; children: ReactNode }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [vocab, setVocab] = useState<VocabEntry[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [settings, setSettings] = useState<Settings>(defaultSettings());
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState(todayStr());
  const [toast, setToast] = useState("");
  const [dictInstall, setDictInstall] = useState<DictProgress | null>(null);
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const tt = useRef<number | undefined>(undefined);

  const notify = useCallback((m: string) => { setToast(m); clearTimeout(tt.current); tt.current = window.setTimeout(() => setToast(""), 3500); }, []);
  const guard = useCallback(async <T,>(f: () => Promise<T>): Promise<T> => {
    try { return await f(); } catch (e) { notify("Could not save to this device's storage. Free some space and try again."); throw e; }
  }, [notify]);

  const reload = useCallback(async () => {
    const [s, m, v, g, c, st] = await Promise.all([db.getAll<Session>("sessions"), db.getAll<Mark>("marks"), db.getAll<VocabEntry>("vocab"), db.getAll<Goal>("goals"), db.getAll<Challenge>("challenges"), db.loadSettings()]);
    setSessions(s.sort(byDate)); setMarks(m); setVocab(v); setGoals(g); setChallenges(c.sort((a, b) => a.createdAt - b.createdAt)); setSettings(st); setLoaded(true);
  }, [db]);
  useEffect(() => { void reload(); }, [reload]);

  // Midnight rollover / returning to the app
  useEffect(() => {
    const tick = () => setToday(todayStr());
    document.addEventListener("visibilitychange", tick);
    const id = window.setInterval(tick, 60_000);
    return () => { document.removeEventListener("visibilitychange", tick); clearInterval(id); };
  }, []);

  // Weekly automatic safety snapshot (kept inside the app; export a file for a copy outside the phone).
  useEffect(() => {
    if (!loaded || (!sessions.length && !vocab.length)) return;
    void db.getAll<{ at: number }>("snapshots").then((all) => {
      const last = Math.max(0, ...all.map((x) => x.at));
      if (Date.now() - last > 7 * 86400000) void takeSnapshot(db, "automatic weekly");
    });
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Record the date a goal is reached, once, so achievements persist even if data later changes.
  useEffect(() => {
    if (!loaded) return;
    for (const g of goals) {
      if (!g.completedAt && goalProgress(g, sessions, vocab, today).done) {
        const done = { ...g, completedAt: today };
        setGoals((gs) => gs.map((x) => (x.id === g.id ? done : x)));
        void db.put("goals", done);
        notify(`Goal reached: ${g.title}`);
      }
    }
  }, [loaded, goals, sessions, vocab, today, db, notify]);

  // Android app: the full dictionary ships inside the APK. Install it once, in the background, with checksum verification.
  // Skipped on the web (there the dictionary is an optional download). After a failure, retry no sooner than 24 h later.
  useEffect(() => {
    if (!loaded || !(isNative() || location.protocol === "app:")) return; // Android app and desktop app ship the dictionary inside
    let failedAt = 0; try { failedAt = Number(localStorage.getItem("fmt-bundled-fail") ?? 0); } catch { /* storage unavailable */ }
    if (Date.now() - failedAt < 86_400_000) return;
    void installBundled(db, "./dict/manifest.json", setDictInstall)
      .then(async (meta) => { if (meta) { await reload(); notify(`Dictionary ready: ${meta.count.toLocaleString()} entries`); } })
      .catch((e: Error) => { try { localStorage.setItem("fmt-bundled-fail", String(Date.now())); } catch { /* ignore */ } notify(`Bundled dictionary could not be installed: ${e.message}`); })
      .finally(() => setDictInstall(null));
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const ledger = useMemo(() => buildLedger(sessions, marks), [sessions, marks]);

  const api: Ctx = {
    db, today, ledger, sessions, marks, vocab, goals, challenges, settings, toast, notify, reload, dictInstall,
    async saveSession(s) {
      const rec: Session = { source: "manual", ...s, id: s.id ?? uid(), createdAt: s.id ? sessions.find((x) => x.id === s.id)?.createdAt ?? Date.now() : Date.now() };
      await guard(() => db.put("sessions", rec));
      setSessions((a) => [rec, ...a.filter((x) => x.id !== rec.id)].sort(byDate));
    },
    async deleteSession(id) { await guard(() => db.delete("sessions", id)); setSessions((a) => a.filter((x) => x.id !== id)); },
    async toggleMark(date, activity) {
      const key = markKey(date, activity);
      if (marks.some((m) => m.key === key)) { await guard(() => db.delete("marks", key)); setMarks((a) => a.filter((m) => m.key !== key)); }
      else { const m: Mark = { key, date, activity }; await guard(() => db.put("marks", m)); setMarks((a) => [...a, m]); }
    },
    async setTarget(activity, minutes) {
      const hist = settingsRef.current.targetHistory.map((e) => ({ ...e, targets: { ...e.targets } }));
      const last = hist[hist.length - 1]!;
      // Targets apply from today onward; earlier days keep the target that was in force then.
      if (last.from === today || (last.from === "0000-01-01" && !sessions.length && !marks.length)) last.targets[activity] = minutes;
      else hist.push({ from: today, targets: { ...last.targets, [activity]: minutes } });
      await api.updateSettings({ targetHistory: hist });
    },
    async saveVocab(v) {
      const entry: VocabEntry = { id: uid(), en: "", example: "", notes: "", addedAt: today, status: "learning", reviews: [], source: "manual", ...v };
      await guard(() => db.put("vocab", entry));
      setVocab((a) => [entry, ...a.filter((x) => x.id !== entry.id)]);
      return entry;
    },
    async deleteVocab(id) { await guard(() => db.delete("vocab", id)); setVocab((a) => a.filter((x) => x.id !== id)); },
    async reviewVocab(id) {
      const v = vocab.find((x) => x.id === id); if (!v) return;
      const next = { ...v, reviews: [...v.reviews, today] };
      await guard(() => db.put("vocab", next)); setVocab((a) => a.map((x) => (x.id === id ? next : x)));
    },
    async saveGoal(g) { await guard(() => db.put("goals", g)); setGoals((a) => [...a.filter((x) => x.id !== g.id), g]); },
    async deleteGoal(id) { await guard(() => db.delete("goals", id)); setGoals((a) => a.filter((x) => x.id !== id)); },
    async saveChallenge(c) { await guard(() => db.put("challenges", c)); setChallenges((a) => [...a.filter((x) => x.id !== c.id), c].sort((x, y) => x.createdAt - y.createdAt)); },
    async startChallenge(start) {
      // The previous challenge is archived, never deleted.
      const cur = challenges.filter((c) => !c.archivedAt).map((c) => ({ ...c, archivedAt: Date.now() }));
      const fresh = newChallenge(start);
      await guard(() => db.putMany("challenges", [...cur, fresh]));
      setChallenges((a) => [...a.map((c) => cur.find((x) => x.id === c.id) ?? c), fresh]);
    },
    async updateSettings(p) {
      const next = { ...settingsRef.current, ...p };
      await guard(() => db.saveSettings(next)); setSettings(next); settingsRef.current = next;
    },
    async startTimer(activity) { await api.updateSettings({ activeTimer: { activity, startedAt: Date.now() } }); },
    async clearTimer() { await api.updateSettings({ activeTimer: null }); },
  };
  if (!loaded) return <div className="boot">Loading…</div>;
  return <C.Provider value={api}>{children}</C.Provider>;
}

export const daysAgo = (d: DateStr, today: DateStr) => diffDays(d, today);
export { addDays };
