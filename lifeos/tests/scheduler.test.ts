import { describe, expect, it } from "vitest";
import { freeIntervals, proposeSchedule, violation, type Busy, type Context, type Item } from "../src/domain/scheduler";
import { canAutoMove, recoverMissed, undoChange } from "../src/domain/reschedule";
import { defaultRules, type Occurrence, type Session, type Task } from "../src/lib/model";
import { addDays, weekdayIndex } from "../src/lib/dates";

const TODAY = "2026-11-23"; // Monday
const mk = (over: Partial<Context["rules"]> = {}, busyMap: Record<string, Busy[]> = {}, now = 7 * 60): Context => ({ rules: { ...defaultRules(), ...over }, today: TODAY, now, busy: (d) => busyMap[d] ?? [] });
const it_ = (p: Partial<Item> & { occId: string }): Item => ({ taskId: p.occId, date: TODAY, estimateMin: 60, priority: 2, deadline: null, earliestStart: null, preferred: "any", flexibility: "flexible", ...p });
const win = { from: TODAY, to: addDays(TODAY, 6) };

describe("free time", () => {
  it("working hours minus busy blocks, with the buffer kept around each", () => {
    const f = freeIntervals(TODAY, mk({ bufferMin: 10 }, { [TODAY]: [{ startMin: 600, endMin: 660, kind: "external" }] }), []);
    expect(f).toEqual([{ start: 480, end: 590 }, { start: 670, end: 1140 }]);
  });
  it("non-working days are empty; today starts after 'now'; the past is empty", () => {
    expect(freeIntervals("2026-11-29", mk(), [])).toEqual([]);                  // Sunday not allowed by default
    expect(freeIntervals(TODAY, mk({}, {}, 10 * 60 + 2), [])[0]).toEqual({ start: 10 * 60 + 5, end: 1140 });
    expect(freeIntervals("2026-11-20", mk(), [])).toEqual([]);
  });
});

describe("proposals", () => {
  it("places by deadline, then priority; prefers the preferred time of day; no overlaps", () => {
    const ctx = mk();
    const { placements, unplaced } = proposeSchedule([it_({ occId: "late", priority: 1, deadline: "2026-11-30" }), it_({ occId: "urgent", priority: 4, deadline: TODAY, preferred: "afternoon" })], ctx, win);
    expect(unplaced).toEqual([]);
    const urgent = placements.find((p) => p.occId === "urgent")!; const late = placements.find((p) => p.occId === "late")!;
    expect(urgent.date).toBe(TODAY); expect(urgent.startMin).toBeGreaterThanOrEqual(12 * 60);   // preferred afternoon
    expect(late.date).toBe(TODAY); expect(late.startMin >= urgent.endMin + 10 || late.endMin + 10 <= urgent.startMin).toBe(true);
  });
  it("respects the daily capacity and spills to the next allowed day", () => {
    const ctx = mk({ maxDailyMin: 120 });
    const { placements } = proposeSchedule([1, 2, 3].map((i) => it_({ occId: `t${i}`, estimateMin: 60 })), ctx, win);
    expect(placements.filter((p) => p.date === TODAY)).toHaveLength(2); expect(placements.find((p) => p.occId === "t3")!.date).toBe("2026-11-24");
  });
  it("reports why something cannot be scheduled instead of forcing it", () => {
    const full = mk({ maxDailyMin: 60 }, {}, 7 * 60);
    const r1 = proposeSchedule([it_({ occId: "a", estimateMin: 60, deadline: TODAY }), it_({ occId: "b", estimateMin: 60, deadline: TODAY })], full, win);
    expect(r1.placements).toHaveLength(1); expect(r1.unplaced[0]).toMatchObject({ occId: "b", reason: "the daily capacity is already used" });
    expect(proposeSchedule([it_({ occId: "p", deadline: "2026-11-20" })], mk(), win).unplaced[0]!.reason).toBe("the deadline has already passed");
    expect(proposeSchedule([it_({ occId: "big", estimateMin: 700 })], mk({ maxDailyMin: 1000 }), { from: TODAY, to: TODAY }).unplaced[0]!.reason).toBe("longer than any free block (split the task)");
    expect(proposeSchedule([it_({ occId: "sun", date: "2026-11-29", flexibility: "fixed" })], mk(), { from: "2026-11-29", to: "2026-11-29" }).unplaced).toHaveLength(1);
  });
  it("never schedules around an external event inside its buffer", () => {
    const ctx = mk({ bufferMin: 15 }, { [TODAY]: [{ startMin: 480, endMin: 1080, kind: "external" }] });
    const p = proposeSchedule([it_({ occId: "x", estimateMin: 30 })], ctx, { from: TODAY, to: TODAY }).placements[0]!;
    expect(p.startMin).toBeGreaterThanOrEqual(1080 + 15);
  });
  it("is deterministic", () => {
    const items = Array.from({ length: 12 }, (_, i) => it_({ occId: `o${i}`, estimateMin: 30 + (i % 4) * 15, priority: ((i % 4) + 1) as 1 | 2 | 3 | 4 }));
    expect(proposeSchedule(items, mk(), win)).toEqual(proposeSchedule([...items].reverse(), mk(), win));
  });
  it("invariants hold for many random inputs: no overlap, inside hours, deadlines and capacity respected", () => {
    let seed = 42; const r = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    for (let round = 0; round < 60; round++) {
      const busy: Record<string, Busy[]> = {};
      for (let d = 0; d < 7; d++) { const date = addDays(TODAY, d); busy[date] = Array.from({ length: r(4) }, () => { const s = 480 + r(600); return { startMin: s, endMin: s + 20 + r(90), kind: "external" as const }; }); }
      const ctx = mk({ maxDailyMin: 180 + r(300), bufferMin: r(3) * 5 }, busy, 7 * 60 + r(300));
      const items = Array.from({ length: 4 + r(12) }, (_, i) => it_({ occId: `r${round}-${i}`, estimateMin: 15 + r(150), priority: (1 + r(4)) as 1 | 2 | 3 | 4, deadline: r(3) ? addDays(TODAY, r(8)) : null, preferred: (["any", "morning", "afternoon", "evening"] as const)[r(4)] }));
      const { placements } = proposeSchedule(items, ctx, win);
      const perDay = new Map<string, { s: number; e: number }[]>();
      for (const p of placements) {
        const item = items.find((x) => x.occId === p.occId)!;
        expect(p.endMin - p.startMin).toBe(item.estimateMin);
        expect(p.startMin).toBeGreaterThanOrEqual(ctx.rules.workStart); expect(p.endMin).toBeLessThanOrEqual(ctx.rules.workEnd);
        expect(ctx.rules.allowedDays).toContain(weekdayIndex(p.date)); if (item.deadline) expect(p.date <= item.deadline).toBe(true);
        if (p.date === TODAY) expect(p.startMin).toBeGreaterThanOrEqual(ctx.now);
        for (const b of busy[p.date] ?? []) expect(p.startMin < b.endMin + ctx.rules.bufferMin && p.endMin > b.startMin - ctx.rules.bufferMin).toBe(false);
        perDay.set(p.date, [...(perDay.get(p.date) ?? []), { s: p.startMin, e: p.endMin }]);
      }
      for (const [, list] of perDay) {
        expect(list.reduce((a, x) => a + (x.e - x.s), 0)).toBeLessThanOrEqual(ctx.rules.maxDailyMin);
        const sorted = [...list].sort((a, b) => a.s - b.s); for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.s).toBeGreaterThanOrEqual(sorted[i - 1]!.e + ctx.rules.bufferMin);
      }
    }
  });
});

describe("validator (also used for manual moves and AI proposals)", () => {
  const ctx = mk({}, { [TODAY]: [{ startMin: 600, endMin: 660, kind: "external" }] });
  const base: { deadline: string | null; earliestStart: string | null; estimateMin: number } = { deadline: "2026-11-25", earliestStart: null, estimateMin: 60 };
  it("rejects every kind of violation with a specific reason", () => {
    const v = (date: string, s: number, e: number, b = base) => violation({ date, startMin: s, endMin: e }, b, ctx);
    expect(v(TODAY, 700, 760)).toBeNull();
    expect(v(TODAY, 620, 680)).toMatch(/overlaps a calendar event/); expect(v(TODAY, 540, 600)).toMatch(/overlaps/);   // inside the buffer
    expect(v(TODAY, 300, 360)).toMatch(/outside working hours|already started/); expect(v(TODAY, 1100, 1180)).toMatch(/outside working hours/);
    expect(v("2026-11-26", 700, 760)).toMatch(/after the deadline/); expect(v("2026-11-29", 700, 760, { ...base, deadline: null })).toMatch(/not an allowed working day/);
    expect(v("2026-11-20", 700, 760)).toMatch(/in the past/); expect(v(TODAY, 700, 730)).toMatch(/shorter than/); expect(v(TODAY, 760, 700)).toMatch(/end must be after start/);
    expect(violation({ date: TODAY, startMin: 700, endMin: 760 }, { ...base, earliestStart: "2026-11-24" }, ctx)).toMatch(/before the earliest start/);
  });
});

const task = (p: Partial<Task> = {}): Task => ({ id: "t", title: "t", notes: "", objectiveId: null, priority: 2, estimateMin: 60, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: null, status: "active", createdAt: 0, ...p });
const occ = (p: Partial<Occurrence> = {}): Occurrence => ({ id: "t@2026-11-22", taskId: "t", date: "2026-11-22", status: "missed", moves: 0, createdAt: 0, ...p });

describe("automatic rescheduling policy", () => {
  const rules = defaultRules();
  it("blocks every protected case with a reason", () => {
    expect(canAutoMove(occ({ status: "done" }), task(), rules, TODAY).reason).toMatch(/completed work is never moved/);
    expect(canAutoMove(occ(), task({ protectedTask: true }), rules, TODAY).reason).toBe("protected task");
    expect(canAutoMove(occ(), task({ flexibility: "fixed" }), rules, TODAY).reason).toBe("fixed appointment");
    expect(canAutoMove(occ(), task({ recurrence: { kind: "daily", days: [], interval: 1, start: "2026-11-01", until: null, count: null, paused: false } }), rules, TODAY).reason).toMatch(/recurring/);
    expect(canAutoMove(occ({ moves: 2 }), task(), rules, TODAY).reason).toMatch(/already moved 2 times/);
    expect(canAutoMove(occ(), task({ deadline: "2026-11-22" }), rules, TODAY).reason).toMatch(/deadline has passed/);
    expect(canAutoMove(occ(), task(), { ...rules, autoReschedule: false }, TODAY).reason).toMatch(/turned off/);
    expect(canAutoMove(occ(), task(), rules, TODAY).ok).toBe(true);
  });
  it("moves an eligible missed task into a valid future slot and records the change", () => {
    const r = recoverMissed([{ occ: occ(), task: task({ deadline: "2026-11-27" }), current: null }], mk(), 1000);
    expect(r.needsApproval).toEqual([]);
    const s = r.mutation.sessions[0]!; const o = r.mutation.occurrences[0]!; const c = r.mutation.changes[0]!;
    expect(s).toMatchObject({ state: "approved", date: TODAY }); expect(o).toMatchObject({ status: "planned", moves: 1, date: TODAY });
    expect(c).toMatchObject({ auto: true, kind: "reschedule", beforeOccDate: "2026-11-22", afterOccDate: TODAY, undone: false });
  });
  it("hands over to the user instead of breaking a rule", () => {
    const tight = mk({ maxDailyMin: 0 });
    const r = recoverMissed([{ occ: occ(), task: task({ deadline: TODAY }), current: null }, { occ: occ({ id: "p@x", taskId: "p" }), task: task({ id: "p", protectedTask: true }), current: null }], tight, 1);
    expect(r.mutation.sessions).toEqual([]); expect(r.needsApproval.map((n) => n.occId).sort()).toEqual(["p@x", "t@2026-11-22"]);
  });
  it("several missed tasks never overlap each other or exceed capacity", () => {
    const ms = [1, 2, 3, 4].map((i) => ({ occ: occ({ id: `m${i}@2026-11-22`, taskId: `m${i}` }), task: task({ id: `m${i}`, estimateMin: 90 }), current: null }));
    const ctx = mk({ maxDailyMin: 240 });
    const r = recoverMissed(ms, ctx, 1);
    const today = r.mutation.sessions.filter((s) => s.date === TODAY).sort((a, b) => a.startMin - b.startMin);
    expect(today.reduce((a, s) => a + s.endMin - s.startMin, 0)).toBeLessThanOrEqual(240);
    for (let i = 1; i < today.length; i++) expect(today[i]!.startMin).toBeGreaterThanOrEqual(today[i - 1]!.endMin + 10);
    expect(r.mutation.sessions).toHaveLength(4);
  });
  it("an undo restores the previous plan; only the latest change per task can be undone; double undo is refused", () => {
    const before: Session = { id: "s0", occId: "t@2026-11-22", date: "2026-11-22", startMin: 540, endMin: 600, state: "approved", reason: "", createdAt: 0 };
    const rec = recoverMissed([{ occ: occ(), task: task(), current: before }], mk(), 5).mutation;
    const change = rec.changes[0]!; const moved = rec.occurrences[0]!;
    const u = undoChange(change, [before, ...rec.sessions], moved, [change], 9);
    expect(u.ok).toBe(true); if (!u.ok) return;
    expect(u.mutation.sessions.map((s) => s.state)).toEqual(["cancelled", "approved"]);
    expect(u.mutation.sessions[1]).toMatchObject({ date: "2026-11-22", startMin: 540 }); expect(u.mutation.occurrences[0]).toMatchObject({ date: "2026-11-22", moves: 0 }); expect(u.mutation.changes[0]!.undone).toBe(true);
    expect(undoChange({ ...change, undone: true }, [], moved, [])).toMatchObject({ ok: false });
    expect(undoChange(change, rec.sessions, moved, [change, { ...change, id: "later", createdAt: change.createdAt + 5 }])).toMatchObject({ ok: false, reason: expect.stringMatching(/later change/) });
  });
});
