// All dates are local calendar dates stored as "YYYY-MM-DD" strings.
// Arithmetic goes through UTC so daylight-saving changes can never shift a day.
export type DateStr = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const todayStr = (now: Date = new Date()): DateStr => toDateStr(now);

function parts(s: DateStr): [number, number, number] {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  return [y, m, d];
}
function fromUTC(dt: Date): DateStr {
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
export function isDateStr(s: unknown): s is DateStr {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return fromUTC(dt) === s;
}
export function addDays(s: DateStr, n: number): DateStr {
  const [y, m, d] = parts(s);
  return fromUTC(new Date(Date.UTC(y, m - 1, d + n)));
}
/** Whole days from a to b (b - a). */
export function diffDays(a: DateStr, b: DateStr): number {
  const [ya, ma, da] = parts(a);
  const [yb, mb, db] = parts(b);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}
/** 0 = Monday … 6 = Sunday */
export function weekdayIndex(s: DateStr): number {
  const [y, m, d] = parts(s);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
export const weekStart = (s: DateStr): DateStr => addDays(s, -weekdayIndex(s));
export const monthStart = (s: DateStr): DateStr => s.slice(0, 8) + "01";
export function addMonths(s: DateStr, n: number): DateStr {
  const [y, m] = parts(s);
  return fromUTC(new Date(Date.UTC(y, m - 1 + n, 1)));
}
export function daysInMonth(s: DateStr): number {
  const [y, m] = parts(s);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function range(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export function formatMinutes(m: number): string {
  const r = Math.round(m);
  if (r < 60) return `${r} min`;
  const h = Math.floor(r / 60);
  const rest = r % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
export const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

export function formatDate(s: DateStr, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
  const [y, m, d] = parts(s);
  return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

// ---- time of day (minutes since local midnight) ----
export const hmToMin = (s: string): number => { const [h = 0, m = 0] = s.split(":").map(Number); return h * 60 + m; };
export const minToHM = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
export const nowMin = (d: Date = new Date()): number => d.getHours() * 60 + d.getMinutes();
export const addMonthsKeepDay = (s: DateStr, n: number): DateStr => {
  const [y = 1970, m = 1, d = 1] = s.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1)); const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};
