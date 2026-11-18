import { useEffect, useState } from "react";
import { useApp } from "./store";
import { Dashboard } from "./views/Dashboard";
import { Track } from "./views/Track";
import { Focus } from "./views/Focus";
import { Progress } from "./views/Progress";
import { More } from "./views/More";
import { Challenge } from "./views/Challenge";
import { Goals } from "./views/Goals";
import { Vocab } from "./views/Vocab";
import { Dictionary } from "./views/Dictionary";
import { Data } from "./views/Data";
import { Reminders } from "./views/Reminders";
import { Playbook } from "./views/Playbook";
import { evalDay } from "./lib/stats";
import { reminderDue, showReminder } from "./lib/reminders";
import { isNative, syncNativeReminders } from "./lib/native";

const TABS = [["today", "Today", "⌂"], ["track", "Track", "＋"], ["focus", "Focus", "◎"], ["progress", "Progress", "▥"], ["more", "More", "☰"]] as const;

function useHash() {
  const [h, setH] = useState(location.hash || "#/today");
  useEffect(() => { const f = () => { setH(location.hash || "#/today"); window.scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []);
  return h.replace(/^#\/?/, "").split("/");
}

export function App() {
  const [tab = "today", sub] = useHash();
  const { toast, settings, ledger, today, updateSettings } = useApp();

  // Reminder: checked on open, on return to the app and every minute while open.
  useEffect(() => {
    const studied = evalDay(ledger, settings.targetHistory, today).total > 0;
    if (isNative()) { // real scheduled notifications; re-planned whenever records or settings change
      void syncNativeReminders(settings.reminders, studied).catch(() => {});
      const again = () => document.visibilityState === "visible" && void syncNativeReminders(settings.reminders, studied).catch(() => {});
      document.addEventListener("visibilitychange", again);
      return () => document.removeEventListener("visibilitychange", again);
    }
    const check = () => {
      if (reminderDue(new Date(), settings.reminders, studied, today)) {
        void showReminder().then(async (shown) => { if (shown) await updateSettings({ reminders: { ...settings.reminders, lastShown: today } }); });
      }
    };
    check(); const id = setInterval(check, 60_000); document.addEventListener("visibilitychange", check);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, [ledger, settings, today, updateSettings]);

  let body;
  if (tab === "track") body = <Track />;
  else if (tab === "focus") body = <Focus />;
  else if (tab === "progress") body = <Progress {...(sub ? { sub } : {})} />;
  else if (tab === "more") body = sub === "challenge" ? <Challenge /> : sub === "goals" ? <Goals /> : sub === "vocab" ? <Vocab /> : sub === "dictionary" ? <Dictionary /> : sub === "data" ? <Data /> : sub === "reminders" ? <Reminders /> : sub === "playbook" ? <Playbook /> : <More />;
  else body = <Dashboard />;

  return (
    <>
      <main>{body}</main>
      <nav className="tabs" aria-label="Main">
        {TABS.map(([k, t, i]) => <a key={k} href={`#/${k}`} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined}><span aria-hidden>{i}</span>{t}</a>)}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
