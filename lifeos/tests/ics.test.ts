import { describe, expect, it } from "vitest";
import { exportIcs, parseIcs } from "../src/domain/ics";
process.env.TZ = "Asia/Kolkata";   // UTC+5:30, no DST: proves "Z" times are converted to local time

const wrap = (...ev: string[]) => ["BEGIN:VCALENDAR", "VERSION:2.0", ...ev, "END:VCALENDAR"].join("\r\n");
const vevent = (...l: string[]) => ["BEGIN:VEVENT", ...l, "END:VEVENT"].join("\r\n");
describe("ICS import", () => {
  it("converts UTC times to local, reads floating times, DURATION, and unescapes titles", () => {
    const r = parseIcs(wrap(
      vevent("UID:a", "SUMMARY:Standup\\, team", "DTSTART:20261124T040000Z", "DTEND:20261124T050000Z"),        // 09:30-10:30 in Kolkata
      vevent("UID:b", "SUMMARY:Lunch", "DTSTART:20261124T120000", "DURATION:PT45M"),
      vevent("UID:c", "SUMMARY:Zone", "DTSTART;TZID=Europe/Paris:20261125T090000", "DTEND;TZID=Europe/Paris:20261125T100000"),
    ), "2026-11-23", "2026-11-30");
    expect(r.skipped).toEqual([]);
    expect(r.events.find((e) => e.externalId.startsWith("a#"))).toMatchObject({ title: "Standup, team", date: "2026-11-24", startMin: 9 * 60 + 30, endMin: 10 * 60 + 30 });
    expect(r.events.find((e) => e.externalId.startsWith("b#"))).toMatchObject({ startMin: 720, endMin: 765 });
    expect(r.events.find((e) => e.externalId.startsWith("c#"))).toMatchObject({ date: "2026-11-25", startMin: 540 });   // TZID wall-clock is used as given
  });
  it("skips all-day events, unreadable events and unsupported repeats, and says why", () => {
    const r = parseIcs(wrap(vevent("UID:d", "SUMMARY:Birthday", "DTSTART;VALUE=DATE:20261124"), vevent("UID:e", "SUMMARY:Broken", "DTSTART:garbage"), vevent("UID:f", "SUMMARY:Monthly", "DTSTART:20261124T090000", "DTEND:20261124T100000", "RRULE:FREQ=MONTHLY;BYMONTHDAY=3")), "2026-11-23", "2026-11-30");
    expect(r.events).toEqual([]); expect(r.skipped).toHaveLength(3); expect(r.skipped.join()).toMatch(/all-day.*unreadable.*not supported/);
  });
  it("expands daily and weekly repeats (BYDAY, INTERVAL, COUNT, UNTIL, EXDATE) inside the window only", () => {
    const daily = parseIcs(wrap(vevent("UID:g", "SUMMARY:Daily", "DTSTART:20261123T090000", "DTEND:20261123T093000", "RRULE:FREQ=DAILY;COUNT=3")), "2026-11-01", "2026-12-31");
    expect(daily.events.map((e) => e.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    const weekly = parseIcs(wrap(vevent("UID:h", "SUMMARY:Gym", "DTSTART:20261123T180000", "DTEND:20261123T190000", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE")), "2026-11-23", "2026-12-06");
    expect(weekly.events.map((e) => e.date)).toEqual(["2026-11-23", "2026-11-25", "2026-11-30", "2026-12-02"]);
    const biweekly = parseIcs(wrap(vevent("UID:i", "SUMMARY:Sync", "DTSTART:20261123T100000", "DTEND:20261123T110000", "RRULE:FREQ=WEEKLY;INTERVAL=2")), "2026-11-23", "2026-12-31");
    expect(biweekly.events.map((e) => e.date)).toEqual(["2026-11-23", "2026-12-07", "2026-12-21"]);
    const until = parseIcs(wrap(vevent("UID:j", "SUMMARY:U", "DTSTART:20261123T090000", "DTEND:20261123T100000", "RRULE:FREQ=DAILY;UNTIL=20261125T235959")), "2026-11-23", "2026-12-31");
    expect(until.events.map((e) => e.date)).toEqual(["2026-11-23", "2026-11-24", "2026-11-25"]);
    const ex = parseIcs(wrap(vevent("UID:k", "SUMMARY:E", "DTSTART:20261123T090000", "DTEND:20261123T100000", "RRULE:FREQ=DAILY;COUNT=3", "EXDATE:20261124T090000")), "2026-11-23", "2026-12-31");
    expect(ex.events.map((e) => e.date)).toEqual(["2026-11-23", "2026-11-25"]);
  });
  it("splits an event crossing midnight, unfolds long lines, and gives stable ids so re-import does not duplicate", () => {
    const r = parseIcs(wrap(vevent("UID:night", "SUMMARY:Night shift with a very long title that the producer folded onto the next line", "  by folding", "DTSTART:20261124T220000", "DTEND:20261125T060000")), "2026-11-23", "2026-11-30");
    expect(r.events.map((e) => [e.date, e.startMin, e.endMin])).toEqual([["2026-11-24", 1320, 1440], ["2026-11-25", 0, 360]]);
    expect(r.events[0]!.title).toMatch(/folded onto the next line by folding$/);
    expect(parseIcs(wrap(vevent("UID:night", "SUMMARY:x", "DTSTART:20261124T220000", "DTEND:20261125T060000")), "2026-11-23", "2026-11-30").events.map((e) => e.externalId)).toEqual(r.events.map((e) => e.externalId));
  });
  it("garbage input never throws", () => { for (const t of ["", "hello", "BEGIN:VEVENT", "BEGIN:VEVENT\nEND:VEVENT", "\u0000\u0001"]) expect(() => parseIcs(t, "2026-11-01", "2026-11-30")).not.toThrow(); });
});
describe("ICS export", () => {
  it("writes stable UIDs, escapes text, folds long lines, and round-trips through the importer", () => {
    const out = exportIcs([{ sessionId: "s1", title: "French; B2, week 3", date: "2026-11-24", startMin: 600, endMin: 660, description: "Goal: Reach B2\nWhy: work", revision: 2 }], new Date(Date.UTC(2026, 10, 23, 8, 0)));
    expect(out).toContain("UID:s1@lifeos"); expect(out).toContain("SEQUENCE:2"); expect(out).toContain("SUMMARY:French\; B2\\, week 3"); expect(out.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    const back = parseIcs(out, "2026-11-23", "2026-11-30").events[0]!; expect(back).toMatchObject({ title: "French; B2, week 3", date: "2026-11-24", startMin: 600, endMin: 660 });
    expect(exportIcs([], new Date()).startsWith("BEGIN:VCALENDAR")).toBe(true);
  });
});
