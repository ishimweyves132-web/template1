import { DEFAULT_TARGETS, defaultSettings, type Activity, type Session } from "../src/lib/model";
import { buildLedger } from "../src/lib/stats";
import type { Mark } from "../src/lib/model";
import { markKey } from "../src/lib/model";

let n = 0;
export const s = (date: string, activity: Activity, minutes: number): Session => ({
  id: `s${++n}`, date, activity, minutes, learned: "", difficulties: "", notes: "", source: "manual", createdAt: n,
});
export const mark = (date: string, activity: Activity): Mark => ({ key: markKey(date, activity), date, activity });
export const history = defaultSettings().targetHistory;
export const ledger = (sessions: Session[], marks: Mark[] = []) => buildLedger(sessions, marks);
export { DEFAULT_TARGETS };
