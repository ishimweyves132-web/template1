// Calendar interchange that works on phone AND computer: import events as busy time, export approved sessions with stable UIDs
// (re-importing the export updates events instead of duplicating them). No account, no server.
import { addDays, range, toDateStr, type DateStr } from "../lib/dates";

export interface ImportedEvent { externalId: string; title: string; date: DateStr; startMin: number; endMin: number }
export interface IcsResult { events: ImportedEvent[]; skipped: string[] }

const unfold = (s: string) => s.replace(/\r?\n[ \t]/g, "");
const unesc = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
interface Prop { name: string; params: Record<string, string>; value: string }
function parseProp(line: string): Prop | null {
  const i = line.indexOf(":"); if (i < 0) return null;
  const [name = "", ...ps] = line.slice(0, i).split(";"); const params: Record<string, string> = {};
  for (const p of ps) { const [k = "", v = ""] = p.split("="); params[k.toUpperCase()] = v; }
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}
/** Local wall-clock Date for an ICS timestamp. "Z" values are converted to the device's timezone; floating and TZID values are taken as local time. */
function parseWhen(p: Prop): { date: DateStr; min: number; allDay: boolean; d: Date } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim()); if (!m) return null;
  const [, y, mo, da, h, mi, , z] = m;
  if (h === undefined) { const d = new Date(Number(y), Number(mo) - 1, Number(da)); return { date: toDateStr(d), min: 0, allDay: true, d }; }
  const d = z ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi))) : new Date(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi));
  return { date: toDateStr(d), min: d.getHours() * 60 + d.getMinutes(), allDay: false, d };
}
const durationMin = (v: string): number | null => { const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(v.trim()); return m ? Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : null; };
const DAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

export function parseIcs(text: string, from: DateStr, to: DateStr): IcsResult {
  const res: IcsResult = { events: [], skipped: [] };
  const blocks = unfold(text).split(/\r?\n/).reduce<string[][]>((acc, line) => { if (/^BEGIN:VEVENT/i.test(line)) acc.push([]); else if (/^END:VEVENT/i.test(line)) { /* close */ } else if (acc.length) acc[acc.length - 1]!.push(line); return acc; }, []);
  for (const lines of blocks) {
    const props = lines.map(parseProp).filter((p): p is Prop => !!p); const get = (n: string) => props.find((p) => p.name === n);
    const title = unesc(get("SUMMARY")?.value ?? "(busy)"); const uid = get("UID")?.value ?? title; const s = get("DTSTART") && parseWhen(get("DTSTART")!);
    if (!s) { res.skipped.push(`${title}: unreadable start time`); continue; }
    if (s.allDay) { res.skipped.push(`${title}: all-day events do not block working hours`); continue; }
    let e = get("DTEND") && parseWhen(get("DTEND")!); let len: number;
    if (e) len = Math.round((e.d.getTime() - s.d.getTime()) / 60000); else { const d = get("DURATION") && durationMin(get("DURATION")!.value); len = d ?? 60; }
    if (!(len > 0)) { res.skipped.push(`${title}: no duration`); continue; }
    const starts: Date[] = []; const rr = get("RRULE"); const ex = new Set(props.filter((p) => p.name === "EXDATE").flatMap((p) => p.value.split(",")).map((v) => v.slice(0, 8)));
    if (!rr) starts.push(s.d);
    else {
      const rule = Object.fromEntries(rr.value.split(";").map((kv) => kv.split("=") as [string, string]));
      const freq = rule.FREQ; const interval = Number(rule.INTERVAL ?? 1) || 1; const count = rule.COUNT ? Number(rule.COUNT) : null;
      const until = rule.UNTIL ? parseWhen({ name: "UNTIL", params: {}, value: rule.UNTIL }) : null;
      if (!["DAILY", "WEEKLY"].includes(freq ?? "") || rule.BYMONTHDAY || rule.BYSETPOS) { res.skipped.push(`${title}: repeats "${rr.value}" which is not supported (only DAILY/WEEKLY)`); continue; }
      const byday = (rule.BYDAY ?? "").split(",").filter(Boolean).map((d) => DAYS.indexOf(d.slice(-2))).filter((n) => n >= 0);
      let fired = 0; const last = addDays(to, 1);
      for (const d of range(s.date, last > s.date ? last : s.date)) {
        const dt = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), Math.floor(s.min / 60), s.min % 60);
        const n = Math.round((new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8))).getTime() - new Date(Number(s.date.slice(0, 4)), Number(s.date.slice(5, 7)) - 1, Number(s.date.slice(8))).getTime()) / 86400000);
        const wk = Math.floor((n + ((new Date(Number(s.date.slice(0, 4)), Number(s.date.slice(5, 7)) - 1, Number(s.date.slice(8))).getDay() + 6) % 7)) / 7);
        const dow = (dt.getDay() + 6) % 7;
        const hit = freq === "DAILY" ? n % interval === 0 : wk % interval === 0 && (byday.length ? byday.includes(dow) : dow === (new Date(Number(s.date.slice(0, 4)), Number(s.date.slice(5, 7)) - 1, Number(s.date.slice(8))).getDay() + 6) % 7);
        if (!hit) continue; fired++; if (count !== null && fired > count) break; if (until && dt.getTime() > until.d.getTime()) break;
        starts.push(dt);
      }
    }
    for (const st of starts) {
      if (ex.has(st.toISOString().slice(0, 4) + String(st.getMonth() + 1).padStart(2, "0") + String(st.getDate()).padStart(2, "0"))) continue;
      let remaining = len; let cur = st;
      while (remaining > 0) {   // a timed event that crosses midnight becomes one block per day
        const day = toDateStr(cur); const startMin = cur.getHours() * 60 + cur.getMinutes(); const take = Math.min(remaining, 1440 - startMin);
        if (day >= from && day <= to) res.events.push({ externalId: `${uid}#${day}T${startMin}`, title, date: day, startMin, endMin: startMin + take });
        remaining -= take; cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1, 0, 0);
      }
    }
  }
  return res;
}

const fold = (line: string) => { const out: string[] = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); } out.push(s); return out.join("\r\n"); };
const stamp = (d: DateStr, min: number) => `${d.replace(/-/g, "")}T${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}00`;
export interface ExportItem { sessionId: string; title: string; date: DateStr; startMin: number; endMin: number; description: string; revision: number }
export function exportIcs(items: ExportItem[], now = new Date()): string {
  const dtstamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}T${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(2, "0")}00Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LifeOS//Plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:LifeOS"];
  for (const it of items) lines.push("BEGIN:VEVENT", `UID:${it.sessionId}@lifeos`, `DTSTAMP:${dtstamp}`, `SEQUENCE:${it.revision}`, `DTSTART:${stamp(it.date, it.startMin)}`, `DTEND:${stamp(it.date, it.endMin)}`, `SUMMARY:${esc(it.title)}`, `DESCRIPTION:${esc(it.description)}`, "TRANSP:OPAQUE", "END:VEVENT");
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
