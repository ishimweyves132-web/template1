import { useEffect, useState } from "react";
import { useApp } from "../store";
import { Card, Page, Field } from "../ui/kit";
import { showReminder } from "../lib/reminders";
import { isNative, nativePermission, requestNativePermission, sendNativeTest } from "../lib/native";

export function Reminders() {
  const { settings, updateSettings, notify } = useApp();
  const r = settings.reminders;
  const native = isNative();
  const [perm, setPerm] = useState<string>(native ? "checking…" : typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  useEffect(() => { if (native) void nativePermission().then(setPerm).catch(() => setPerm("unavailable")); }, [native]);
  const set = (p: Partial<typeof r>) => updateSettings({ reminders: { ...r, ...p } });
  const ask = async () => {
    if (native) { setPerm((await requestNativePermission()) ? "granted" : "denied"); return; }
    if (typeof Notification !== "undefined" && Notification.permission === "default") setPerm(await Notification.requestPermission());
  };
  return (
    <Page title="Reminders" back="#/more">
      <Card title="Daily study reminder">
        <label className="switch"><input type="checkbox" checked={r.enabled} onChange={async (e) => { const on = e.target.checked; /* read before any await: React resets controlled inputs */ if (on) await ask(); await set({ enabled: on }); }} /> <span>Remind me if I have not practised yet</span></label>
        <Field label="Remind me at"><input type="time" value={r.time} onChange={(e) => set({ time: e.target.value || "19:00" })} /></Field>
        <p className="small">Notifications: <b>{perm}</b>. The message is always neutral: “A short session is enough — even 10 minutes counts.” At most one a day, and skipped on days you have already practised.</p>
        {perm === "granted" && <button className="btn" onClick={async () => { if (native) await sendNativeTest(); else await showReminder(); notify("Test notification sent"); }}>Send a test</button>}
      </Card>
      <Card title={native ? "How reminders work on your phone" : "Honest limitation"}>
        {native
          ? <p className="small">Reminders are scheduled on your phone for the next 14 days and re-planned every time you open the app or log practice, so a day you already practised is skipped. They work with the app closed. If you do not open the app for 14 days they stop, and Android battery saving can delay a notification by a few minutes.</p>
          : <p className="small">This is the web version. Browsers cannot schedule notifications for when the app is closed, so the reminder appears when you open the app after the chosen time, as a notification and a banner on Today. The Android app (APK) schedules real reminders that work with the app closed.</p>}
      </Card>
    </Page>
  );
}
