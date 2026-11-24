import { useEffect, useState } from "react";
import { useApp } from "./store";
import { Icon } from "./ui/kit";
import { Today } from "./views/Today";
import { Vision } from "./views/Vision";
import { Planner } from "./views/Planner";
import { Progress } from "./views/Progress";
import { Coach } from "./views/Coach";
import { Settings } from "./views/Settings";
import { minToHM, nowMin } from "./lib/dates";
import { isNative, syncNativeReminders } from "./lib/native";
import { planSessionReminders } from "./lib/reminders";

const TABS = [["today", "Today"], ["vision", "Vision"], ["planner", "Planner"], ["progress", "Progress"], ["coach", "Assistant"]] as const;
function useRoute(): string { const [h, setH] = useState(location.hash.replace(/^#\/?/, "") || "today"); useEffect(() => { const f = () => { setH(location.hash.replace(/^#\/?/, "") || "today"); window.scrollTo(0, 0); }; addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []); return h.split("/")[0]!; }

export function App() {
  const route = useRoute(); const { toast, settings, sessions, occurrences, tasks, today } = useApp();
  // Android app: real notifications that fire even when the app is closed, re-planned whenever the plan changes.
  useEffect(() => { if (!isNative()) return; void syncNativeReminders(settings.remindersEnabled ? planSessionReminders(sessions, occurrences, tasks, today, new Date(), settings.reminderLeadMin) : []).catch(() => undefined); }, [settings.remindersEnabled, settings.reminderLeadMin, sessions, occurrences, tasks, today]);
  // Reminders while the app is open (a web app cannot schedule notifications for when it is closed).
  useEffect(() => {
    if (isNative() || !settings.remindersEnabled || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const tick = () => {
      const live = new Set(occurrences.filter((o) => o.status === "planned").map((o) => o.id)); const n = nowMin();
      for (const s of sessions) {
        if (s.state !== "approved" || s.date !== today || !live.has(s.occId) || n < s.startMin - settings.reminderLeadMin || n >= s.startMin) continue;
        let seen = ""; try { seen = sessionStorage.getItem(`rem-${s.id}`) ?? ""; } catch { /* ignore */ } if (seen) continue; try { sessionStorage.setItem(`rem-${s.id}`, "1"); } catch { /* ignore */ }
        const t = tasks.find((x) => x.id === occurrences.find((o) => o.id === s.occId)?.taskId);
        const body = `${t?.title ?? "Task"} at ${minToHM(s.startMin)}`;
        void navigator.serviceWorker?.getRegistration().then((reg) => { if (reg) void reg.showNotification("Up next", { body, tag: s.id }); else new Notification("Up next", { body }); });
      }
    };
    tick(); const id = setInterval(tick, 30_000); return () => clearInterval(id);
  }, [settings.remindersEnabled, settings.reminderLeadMin, sessions, occurrences, tasks, today]);
  const view = route === "vision" ? <Vision /> : route === "planner" ? <Planner /> : route === "progress" ? <Progress /> : route === "coach" ? <Coach /> : route === "settings" ? <Settings /> : <Today />;
  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand">Life<i>OS</i></div>
        {TABS.map(([k, t]) => <a key={k} href={`#/${k}`} className={route === k || (k === "today" && !TABS.some(([x]) => x === route) && route !== "settings") ? "on" : ""} aria-current={route === k ? "page" : undefined}><Icon n={k} />{t}</a>)}
        <a href="#/settings" className={`settings-link ${route === "settings" ? "on" : ""}`} aria-current={route === "settings" ? "page" : undefined}><Icon n="settings" />Settings</a>
        <div className="side-foot">Design your life.<br />Live with intention.</div>
      </nav>
      <main className="main">{view}</main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
