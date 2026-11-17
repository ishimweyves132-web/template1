import { describe, expect, it } from "vitest";
import { addDays, diffDays, weekStart, addMonths, isDateStr, formatMinutes } from "../src/lib/dates";
import { bars, evalDay, streaks, summarize, targetsOn } from "../src/lib/stats";
import { history, ledger, mark, s } from "./helpers";

describe("dates", () => {
  it("does day arithmetic across month, year and DST boundaries", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30"); // EU DST change
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
    expect(weekStart("2026-11-17")).toBe("2026-11-16"); // Tuesday -> Monday
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // Sunday -> Monday
    expect(addMonths("2026-11-01", -11)).toBe("2025-12-01");
    expect(isDateStr("2026-02-30")).toBe(false);
    expect(formatMinutes(80)).toBe("1 h 20 min");
  });
});

describe("daily evaluation — the 17 November example from the brief", () => {
  const d = "2026-11-17";
  const l = ledger([
    s(d, "listening", 20), s(d, "speaking", 10), s(d, "vocabulary", 15),
    s(d, "grammar", 0), s(d, "reading", 10), s(d, "writing", 5),
  ]);
  const e = evalDay(l, history, d);
  it("total time 60, target 80, 75%", () => {
    expect(e.total).toBe(60); expect(e.targetTotal).toBe(80); expect(e.timePct).toBe(75);
  });
  it("3 completed, 2 partial, 1 missed", () => {
    expect([e.completed, e.partial, e.missed]).toEqual([3, 2, 1]);
    expect(e.state).toBe("partial");
  });
  it("records partial minutes truthfully (12 of 20 stays 12)", () => {
    const x = evalDay(ledger([s(d, "listening", 12)]), history, d);
    expect(x.items[0]).toMatchObject({ achieved: 12, target: 20, state: "partial" });
  });
});

describe("daily evaluation — edge cases", () => {
  const d = "2026-11-10";
  it("sums several sessions of one activity", () => {
    const e = evalDay(ledger([s(d, "listening", 8), s(d, "listening", 12)]), history, d);
    expect(e.items[0]).toMatchObject({ achieved: 20, state: "done" });
  });
  it("over-practising one activity does not hide a neglected one", () => {
    const e = evalDay(ledger([s(d, "listening", 60)]), history, d);
    expect(e.total).toBe(60); expect(e.timePct).toBe(25); // 20 capped / 80
  });
  it("manual 'mark done' counts as done but keeps real minutes", () => {
    const e = evalDay(ledger([s(d, "speaking", 5)], [mark(d, "speaking")]), history, d);
    expect(e.items[1]).toMatchObject({ achieved: 5, state: "done", marked: true });
  });
  it("all targets met = complete; optional activities do not block it", () => {
    const l = ledger(["listening", "speaking", "vocabulary", "grammar", "reading", "writing"].map((a) => s(d, a as any, 100)));
    expect(evalDay(l, history, d).state).toBe("complete");
    expect(evalDay(l, history, d).items.find((i) => i.activity === "shadowing")!.state).toBe("off");
  });
  it("an empty day is 'none'", () => expect(evalDay(ledger([s("2026-11-01", "reading", 5)]), history, d).state).toBe("none"));
  it("changing a target applies only from that date, past days keep their old target", () => {
    const h = [...history, { from: "2026-11-10", targets: { ...history[0]!.targets, listening: 30 } }];
    expect(targetsOn(h, "2026-11-09").listening).toBe(20);
    expect(targetsOn(h, "2026-11-10").listening).toBe(30);
    expect(evalDay(ledger([s("2026-11-09", "listening", 20)]), h, "2026-11-09").items[0]!.state).toBe("done");
    expect(evalDay(ledger([s("2026-11-10", "listening", 20)]), h, "2026-11-10").items[0]!.state).toBe("partial");
  });
});

describe("streaks", () => {
  const today = "2026-11-17";
  it("counts consecutive studied days ending today", () => {
    const l = ledger([s("2026-11-15", "reading", 5), s("2026-11-16", "reading", 5), s(today, "reading", 5)]);
    expect(streaks(l, today)).toEqual({ current: 3, longest: 3 });
  });
  it("an empty today does not break the streak yet", () => {
    const l = ledger([s("2026-11-15", "reading", 5), s("2026-11-16", "reading", 5)]);
    expect(streaks(l, today).current).toBe(2);
  });
  it("a missed day resets current but keeps the longest", () => {
    const l = ledger([1, 2, 3, 4, 5].map((i) => s(`2026-11-0${i}`, "reading", 5)).concat([s("2026-11-16", "reading", 5)]));
    expect(streaks(l, today)).toEqual({ current: 1, longest: 5 });
  });
  it("two empty days -> current 0", () => expect(streaks(ledger([s("2026-11-10", "reading", 5)]), today)).toEqual({ current: 0, longest: 1 }));
  it("zero-minute sessions do not count as studying", () => expect(streaks(ledger([s(today, "reading", 0)]), today).current).toBe(0));
});

describe("period statistics", () => {
  const today = "2026-11-17"; // Tuesday; week starts 2026-11-16
  const l = ledger([
    s("2026-11-09", "listening", 20), s("2026-11-10", "listening", 30), // last week
    s("2026-11-16", "listening", 20), s("2026-11-16", "speaking", 10), s("2026-11-17", "reading", 10),
  ]);
  it("weekly totals, sessions and consistency come from stored records", () => {
    const w = summarize(l, history, "2026-11-16", "2026-11-22", today); // future days ignored
    expect(w.total).toBe(40); expect(w.sessions).toBe(3); expect(w.days).toBe(2);
    expect(w.daysStudied).toBe(2); expect(w.consistency).toBe(100); expect(w.avgPerDay).toBe(20);
  });
  it("days before the first record are not counted as missed", () => {
    const m = summarize(l, history, "2026-10-01", today, today);
    expect(m.days).toBe(9); // 2026-11-09 … 11-17
    expect(m.daysStudied).toBe(4);
    expect(m.consistency).toBe(44);
  });
  it("activity-specific actual vs goal", () => {
    const m = summarize(l, history, "2026-11-09", today, today);
    expect(m.byActivity.listening).toMatchObject({ achieved: 70, target: 180, daysPracticed: 3 });
  });
  it("bars: week unit aligns to Monday and keeps empty weeks", () => {
    const b = bars(l, history, "week", 3, today);
    expect(b.map((x) => x.from)).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(b.map((x) => x.minutes)).toEqual([0, 50, 40]);
  });
  it("no records at all gives zeros, never NaN", () => {
    const e = summarize(ledger([]), history, "2026-11-01", today, today);
    expect(e).toMatchObject({ days: 0, total: 0, avgPerDay: 0, consistency: 0 });
  });
});
