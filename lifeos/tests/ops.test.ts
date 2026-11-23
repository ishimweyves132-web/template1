import { describe, expect, it } from "vitest";
import { approvePlacements, completeOccurrence, missingOccurrences, settleMissed, toggleHabit } from "../src/domain/ops";
import { Db } from "../src/lib/db";
import { createBackup, restoreBackup, takeSnapshot, validateBackup } from "../src/lib/backup";
import { defaultSettings, occId, type Habit, type Occurrence, type Session, type Task } from "../src/lib/model";

const task = (p: Partial<Task> = {}): Task => ({ id: "t", title: "t", notes: "", objectiveId: null, priority: 2, estimateMin: 60, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: null, status: "active", createdAt: 0, ...p });
const occ = (p: Partial<Occurrence> = {}): Occurrence => ({ id: "t@2026-11-23", taskId: "t", date: "2026-11-23", status: "planned", moves: 0, createdAt: 0, ...p });
const T = "2026-11-23";

describe("completion keeps history", () => {
  it("done/partial/skipped each create a NEW execution; planned and actual time are separate", () => {
    const d = completeOccurrence(occ(), task({ estimateMin: 60 }), { outcome: "done", minutes: 75 }, T, 5);
    expect(d.occurrence.status).toBe("done"); expect(d.execution).toMatchObject({ minutes: 75, outcome: "done", pct: 100 });
    const p = completeOccurrence(occ(), task(), { outcome: "partial", minutes: 20, pct: 40, reason: "interrupted" }, T, 6);
    expect(p.occurrence.status).toBe("partial"); expect(p.execution).toMatchObject({ pct: 40, reason: "interrupted" });
    const s = completeOccurrence(occ(), task(), { outcome: "skipped", minutes: 99, reason: "ill" }, T, 7);
    expect(s.execution.minutes).toBe(0); expect(s.occurrence.status).toBe("skipped");
    expect(new Set([d.execution.id, p.execution.id, s.execution.id]).size).toBe(3);
    expect(completeOccurrence(occ(), task(), { outcome: "partial", minutes: 5, pct: 500 }, T).execution.pct).toBe(100);
    expect(completeOccurrence(occ(), task(), { outcome: "done", minutes: -5 }, T).execution.minutes).toBe(0);
  });
});
describe("occurrences", () => {
  const daily = task({ recurrence: { kind: "daily", days: [], interval: 1, start: "2026-11-23", until: null, count: null, paused: false } });
  it("are generated for a bounded window, idempotently, with stable ids", () => {
    const a = missingOccurrences([daily], [], "2026-11-23", "2026-11-25"); expect(a.map((o) => o.id)).toEqual(["t@2026-11-23", "t@2026-11-24", "t@2026-11-25"]);
    expect(missingOccurrences([daily], a, "2026-11-23", "2026-11-27").map((o) => o.id)).toEqual(["t@2026-11-26", "t@2026-11-27"]);
    expect(missingOccurrences([daily], a, "2026-11-23", "2026-11-25")).toEqual([]);
    expect(occId("t", "2026-11-23")).toBe("t@2026-11-23");
  });
  it("one-off tasks with a date get one occurrence; inbox tasks (no date) get none", () => {
    expect(missingOccurrences([task({ onDate: "2026-11-24" }), task({ id: "inbox" })], [], "2026-11-23", "2026-12-10")).toHaveLength(1);
  });
  it("past planned occurrences become 'missed' and done ones are untouched", () => {
    const s = settleMissed([occ({ id: "a", date: "2026-11-20" }), occ({ id: "b", date: "2026-11-20", status: "done" }), occ({ id: "c", date: T }), occ({ id: "d", date: "2026-11-21", status: "in-progress" })], T);
    expect(s.map((o) => [o.id, o.status])).toEqual([["a", "missed"], ["d", "missed"]]);
  });
});
describe("approving a schedule", () => {
  it("creates approved sessions + change records; re-approving cancels the old session and keeps it in the record", () => {
    const o = occ(); const first = approvePlacements([{ occId: o.id, taskId: "t", date: "2026-11-24", startMin: 600, endMin: 660, why: "first free slot" }], [o], [], "Plan my week", 1);
    expect(first.sessions).toHaveLength(1); expect(first.sessions[0]).toMatchObject({ state: "approved", date: "2026-11-24" }); expect(first.changes[0]).toMatchObject({ kind: "schedule", auto: false, before: null, afterOccDate: "2026-11-24" });
    expect(first.occurrences[0]!.date).toBe("2026-11-24");
    const second = approvePlacements([{ occId: o.id, taskId: "t", date: "2026-11-24", startMin: 700, endMin: 760, why: "x" }], [{ ...o, date: "2026-11-24" }], first.sessions as Session[], "Manual", 2);
    expect(second.sessions.map((s) => s.state)).toEqual(["cancelled", "approved"]); expect(second.changes[0]).toMatchObject({ kind: "reschedule", before: { startMin: 600 } });
    expect(approvePlacements([{ occId: "ghost", taskId: "t", date: T, startMin: 600, endMin: 660, why: "" }], [], [], "x").sessions).toEqual([]);
  });
  it("habit toggle adds a log or removes the existing one", () => {
    const h: Habit = { id: "h", title: "Read", objectiveId: null, days: [], createdAt: 0, archived: false };
    const on = toggleHabit(h, [], T); expect(on.add).toMatchObject({ habitId: "h", date: T });
    expect(toggleHabit(h, [on.add!], T).remove?.id).toBe(on.add!.id);
  });
});

let n = 0; const open = () => Db.open(`lifeos-test-${++n}-${Math.random()}`);
describe("database and backup", () => {
  it("persists across close and reopen; multi-store writes are atomic", async () => {
    const name = `persist-${Math.random()}`; let db = await Db.open(name);
    await db.write({ put: [["tasks", task({ id: "x" })], ["occurrences", occ({ id: "x@1" })]] });
    db.close(); db = await Db.open(name);
    expect((await db.getAll<Task>("tasks"))[0]!.id).toBe("x"); expect(await db.count("occurrences")).toBe(1);
    await expect(db.write({ put: [["tasks", task({ id: "y" })], ["occurrences", { noId: true }]] })).rejects.toThrow();   // invalid record aborts the whole transaction
    expect(await db.count("tasks")).toBe(1);
  });
  it("settings merge with defaults so new rules never break old data", async () => {
    const db = await open(); await db.setKv("settings", { rules: { maxDailyMin: 100 } }); const s = await db.loadSettings();
    expect(s.rules.maxDailyMin).toBe(100); expect(s.rules.bufferMin).toBe(defaultSettings().rules.bufferMin);
  });
  it("round-trips a backup, takes a safety snapshot before restoring, and refuses damaged or foreign files", async () => {
    const a = await open(); await a.write({ put: [["tasks", task({ id: "keep" })]] });
    const file = JSON.parse(JSON.stringify(await createBackup(a)));
    const b = await open(); await b.write({ put: [["tasks", task({ id: "old" })]] });
    await restoreBackup(b, file);
    expect((await b.getAll<Task>("tasks")).map((t) => t.id)).toEqual(["keep"]);
    const snaps = await b.getAll<{ backup: { data: { tasks: Task[] } } }>("snapshots"); expect(snaps[0]!.backup.data.tasks[0]!.id).toBe("old");
    const tampered = structuredClone(file); tampered.data.tasks[0].title = "evil";
    await expect(validateBackup(tampered)).rejects.toThrow(/damaged/); await expect(validateBackup({ x: 1 })).rejects.toThrow(/not a LifeOS/); await expect(validateBackup(null)).rejects.toThrow();
    for (let i = 0; i < 7; i++) await takeSnapshot(b, `r${i}`); expect(await b.count("snapshots")).toBe(5);
  });
});
