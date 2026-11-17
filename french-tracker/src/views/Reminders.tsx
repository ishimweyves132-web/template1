import { useState } from "react";
import { useApp } from "../store";
import { Card, Page, Field } from "../ui/kit";
import { showReminder } from "../lib/reminders";

export function Reminders() {
  const { settings, updateSettings, notify } = useApp();
  const r = settings.reminders;
  const [perm, setPerm] = useState(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  const set = (p: Partial<typeof r>) => updateSettings({ reminders: { ...r, ...p } });
  return (
    <Page title="Reminders" back="#/more">
      <Card title="Daily study reminder">
        <label className="switch"><input type="checkbox" checked={r.enabled} onChange={async (e) => {
          if (e.target.checked && typeof Notification !== "undefined" && Notification.permission === "default") setPerm(await Notification.requestPermission());
          await set({ enabled: e.target.checked });
        }} /> <span>Remind me if I have not practised yet</span></label>
        <Field label="Remind me after"><input type="time" value={r.time} onChange={(e) => set({ time: e.target.value || "19:00" })} /></Field>
        <p className="small">Notifications: <b>{perm === "unsupported" ? "not supported by this browser" : perm}</b>. The message is always neutral: “A short session is enough — even 10 minutes counts.” Sent at most once a day, and never if you have already practised.</p>
        {perm === "granted" && <button className="btn" onClick={async () => { await showReminder(); notify("Test notification sent"); }}>Send a test</button>}
      </Card>
      <Card title="Honest limitation">
        <p className="small">This is a web app. Android does not let web apps schedule notifications while they are closed, so the reminder appears when you open the app (or while it is open in the background) after the chosen time, as a notification and a banner on the Today screen. For reminders that fire with the app closed, the app would need to be wrapped as a native Android app (Capacitor) — see docs/ARCHITECTURE.md.</p>
      </Card>
    </Page>
  );
}
