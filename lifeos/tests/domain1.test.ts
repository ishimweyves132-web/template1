import { describe, expect, it } from "vitest";
import { krFraction, latestValue, objectiveOutcome, pace, trail, elapsedFraction } from "../src/domain/progress";
import { recurrenceDates, taskDates } from "../src/domain/recurrence";
import type { KeyResult, KrPoint, Objective, Recurrence, Task } from "../src/lib/model";

const kr = (p: Partial<KeyResult> = {}): KeyResult => ({ id: "k1", objectiveId: "o1", title: "t", type: "numeric", direction: "up", baseline: 0, target: 100, unit: "", currency: "", createdAt: 0, ...p });
const pt = (krId: string, date: string, value: number, createdAt = 0): KrPoint => ({ id: `${krId}${date}${value}`, krId, date, value, note: "", createdAt });
const obj = (p: Partial<Objective> = {}): Objective => ({ id: "o1", title: "o", description: "", why: "", areaId: null, level: "annual", parentId: null, start: "2026-01-01", target: "2026-12-31", priority: 2, status: "active", completionCriteria: "", evidenceRequired: false, createdAt: 0, updatedAt: 0, ...p });

describe("key result progress", () => {
  it("increasing target: revenue 10k -> 50k", () => {
    const k = kr({ baseline: 10000, target: 50000 });
    expect(krFraction(k, 10000)).toBe(0); expect(krFraction(k, 30000)).toBe(0.5); expect(krFraction(k, 50000)).toBe(1); expect(krFraction(k, 70000)).toBe(1); expect(krFraction(k, 5000)).toBe(0);
  });
  it("decreasing target: reduce unnecessary spend 500 -> 200 uses the opposite direction", () => {
    const k = kr({ direction: "down", baseline: 500, target: 200 });
    expect(krFraction(k, 500)).toBe(0); expect(krFraction(k, 350)).toBe(0.5); expect(krFraction(k, 200)).toBe(1); expect(krFraction(k, 600)).toBe(0);
  });
  it("binary and misconfigured key results", () => {
    expect(krFraction(kr({ type: "binary", baseline: 0, target: 1 }), 1)).toBe(1); expect(krFraction(kr({ type: "binary" }), 0)).toBe(0);
    expect(krFraction(kr({ baseline: 50, target: 50 }), 50)).toBeNull();               // no distance to measure
    expect(krFraction(kr({ baseline: 100, target: 10, direction: "up" }), 50)).toBeNull(); // target behind baseline for the stated direction
  });
  it("current value is the latest measurement by date, else the baseline", () => {
    const k = kr({ baseline: 3 });
    expect(latestValue(k, [])).toBe(3);
    expect(latestValue(k, [pt("k1", "2026-03-01", 20), pt("k1", "2026-02-01", 90), pt("other", "2026-04-01", 1)])).toBe(20);
  });
});

describe("objective outcome and pace", () => {
  it("averages key results; falls back to measurable children; unmeasurable stays null (never 0%)", () => {
    const parent = obj({ id: "p" }); const child = obj({ id: "c", parentId: "p" }); const loner = obj({ id: "l" });
    const krs = [kr({ id: "a", objectiveId: "c", target: 10 }), kr({ id: "b", objectiveId: "c", target: 100 })];
    const pts = [pt("a", "2026-02-01", 10), pt("b", "2026-02-01", 50)];
    expect(objectiveOutcome(child, [parent, child], krs, pts).fraction).toBe(0.75);
    expect(objectiveOutcome(parent, [parent, child], krs, pts).fraction).toBe(0.75);
    expect(objectiveOutcome(loner, [loner], [], []).fraction).toBeNull();
  });
  it("pace compares outcome with time elapsed", () => {
    const o = obj({ start: "2026-01-01", target: "2026-01-11" }); // 10-day window
    expect(elapsedFraction(o, "2026-01-06")).toBe(0.5);
    const f = (x: number) => pace(o, { fraction: x, measured: 1, total: 1 }, "2026-01-06");
    expect([f(0.7), f(0.5), f(0.35), f(0.1)]).toEqual(["ahead", "on-track", "behind", "at-risk"]);
    expect(pace(o, { fraction: null, measured: 0, total: 0 }, "2026-01-06")).toBe("unmeasured");
    expect(pace(o, { fraction: 0.1, measured: 1, total: 1 }, "2025-12-01")).toBe("not-started");
  });
  it("trail climbs from a task's objective to the long-term goal", () => {
    const g = obj({ id: "g", level: "long-term" }), a = obj({ id: "a", parentId: "g" }), q = obj({ id: "q", parentId: "a", level: "quarterly" });
    expect(trail(q, [g, a, q]).map((o) => o.id)).toEqual(["g", "a", "q"]);
  });
});

const rec = (p: Partial<Recurrence>): Recurrence => ({ kind: "daily", days: [], interval: 1, start: "2026-11-02", until: null, count: null, paused: false, ...p });
describe("recurrence", () => {
  it("daily, every-2-days, weekdays, selected weekdays", () => {
    expect(recurrenceDates(rec({}), "2026-11-02", "2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(recurrenceDates(rec({ interval: 2 }), "2026-11-02", "2026-11-08")).toEqual(["2026-11-02", "2026-11-04", "2026-11-06", "2026-11-08"]);
    expect(recurrenceDates(rec({ kind: "weekdays" }), "2026-11-06", "2026-11-10")).toEqual(["2026-11-06", "2026-11-09", "2026-11-10"]);
    expect(recurrenceDates(rec({ kind: "weekly", days: [0, 2] }), "2026-11-02", "2026-11-15")).toEqual(["2026-11-02", "2026-11-04", "2026-11-09", "2026-11-11"]);
  });
  it("weekly without days repeats on the start weekday; monthly keeps the day and clamps at month end", () => {
    expect(recurrenceDates(rec({ kind: "weekly" }), "2026-11-02", "2026-11-23")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
    expect(recurrenceDates(rec({ kind: "monthly", start: "2026-01-31" }), "2026-01-01", "2026-04-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });
  it("until, count (counted from the start, not the window), pause, none", () => {
    expect(recurrenceDates(rec({ until: "2026-11-03" }), "2026-11-02", "2026-11-30")).toEqual(["2026-11-02", "2026-11-03"]);
    expect(recurrenceDates(rec({ count: 3 }), "2026-11-04", "2026-11-30")).toEqual(["2026-11-04"]);   // 3rd occurrence is Nov 4; later ones exceed the count
    expect(recurrenceDates(rec({ paused: true }), "2026-11-02", "2026-11-30")).toEqual([]);
    expect(recurrenceDates(rec({ kind: "none" }), "2026-11-02", "2026-11-30")).toEqual([]);
  });
  it("never produces dates before the start; windows bound the output", () => {
    expect(recurrenceDates(rec({ start: "2026-11-10" }), "2026-11-01", "2026-11-11")).toEqual(["2026-11-10", "2026-11-11"]);
    expect(recurrenceDates(rec({}), "2026-11-02", "2030-11-02").length).toBeGreaterThan(1000);   // caller chooses a small window
  });
  it("one-off tasks use onDate; cancelled tasks produce nothing", () => {
    const t = { status: "active", onDate: "2026-11-05", recurrence: null } as unknown as Task;
    expect(taskDates(t, "2026-11-01", "2026-11-10")).toEqual(["2026-11-05"]); expect(taskDates(t, "2026-11-06", "2026-11-10")).toEqual([]);
    expect(taskDates({ ...t, status: "cancelled" }, "2026-11-01", "2026-11-10")).toEqual([]);
    expect(taskDates({ ...t, onDate: null }, "2026-11-01", "2026-11-10")).toEqual([]);
  });
});
