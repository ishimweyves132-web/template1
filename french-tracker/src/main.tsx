import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { Db } from "./lib/db";
import { Provider } from "./store";
import { App } from "./App";

const root = createRoot(document.getElementById("root")!);
Db.open().then((db) => {
  root.render(<StrictMode><Provider db={db}><App /></Provider></StrictMode>);
  void navigator.storage?.persist?.();
  if ("serviceWorker" in navigator && import.meta.env.PROD) navigator.serviceWorker.register("./sw.js").catch(() => {});
}).catch((e) => {
  root.render(<div className="boot error">Local storage is unavailable ({String(e?.message ?? e)}). Private/incognito windows and some restricted browsers block it; open the app in a normal Chrome window.</div>);
});
