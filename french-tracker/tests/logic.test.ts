import { describe, expect, it } from "vitest";
import { BLOCKS, CHALLENGE_LENGTH, challengeStatus, dayOf, newChallenge } from "../src/lib/challenge";
import { badges, goalProgress, nextMilestone, personalRecords } from "../src/lib/goals";
import { observations } from "../src/lib/weakness";
import { uid, type Goal, type VocabEntry } from "../src/lib/model";
import { addDays } from "../src/lib/dates";
import { history, ledger, s } from "./helpers";

const goal = (p: Partial<Goal>): Goal => ({ id: uid(), title: "g", kind: "minutes", activity: "any", target: 100, startDate: "2026-01-01", manualCount: 0, vocabStatus: "any", createdAt: 0, ...p });
const word = (fr: string, status: "learning" | "learned" = "learning", addedAt = "2026-11-01"): VocabEntry =>
  ({ id: uid(), fr, en: "", example: "", notes: "", addedAt, status, reviews: [], source: "manual" });

describe("30-day challenge", () => {
  it("covers all 30 days with the six learning blocks", () => {
    expect(BLOCKS[0]!.from).toBe(1); expect(BLOCKS.at(-1)!.to).toBe(30);
    for (let i = 1; i < BLOCKS.length; i++) expect(BLOCKS[i]!.from).toBe(BLOCKS[i - 1]!.to + 1);
  });
  it("missing days never reset progress; missed days are listed and can be caught up", () => {
    const c = newChallenge("2026-11-01");
    c.days[1] = { ...dayOf(c, 1), done: true }; c.days[2] = { ...dayOf(c, 2), done: true };
    // 10 days later nothing else was done
    const st = challengeStatus(c, "2026-11-11"); // scheduled day 11
    expect(st.scheduledDay).toBe(11);
    expect(st.doneCount).toBe(2);
    expect(st.nextDay).toBe(3);               // resume point
    expect(st.missed).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(st.remaining).toBe(28);
    c.days[3] = { ...dayOf(c, 3), done: true }; // catching up later
    expect(challengeStatus(c, "2026-11-11").missed).not.toContain(3);
  });
  it("is not started before its start date and can finish", () => {
    const c = newChallenge("2026-12-01");
    expect(challengeStatus(c, "2026-11-17").notStarted).toBe(true);
    for (let n = 1; n <= CHALLENGE_LENGTH; n++) c.days[n] = { ...dayOf(c, n), done: true };
    expect(challengeStatus(c, "2026-12-05")).toMatchObject({ finished: true, nextDay: null, remaining: 0 });
  });
});

describe("goals", () => {
  const sessions = [s("2026-11-01", "listening", 600), s("2026-11-02", "listening", 600), s("2026-11-02", "speaking", 60)];
  it("minutes goal: 20 h of listening, counts only that activity", () => {
    const p = goalProgress(goal({ kind: "minutes", activity: "listening", target: 1200 }), sessions, [], "2026-11-17");
    expect(p).toMatchObject({ current: 1200, pct: 100, done: true });
    expect(goalProgress(goal({ kind: "minutes", activity: "listening", target: 2400 }), sessions, [], "2026-11-17").pct).toBe(50);
  });
  it("ignores sessions before the goal start date", () => {
    expect(goalProgress(goal({ kind: "minutes", target: 100, startDate: "2026-11-02" }), sessions, [], "2026-11-17").current).toBe(660);
  });
  it("sessions goal", () => expect(goalProgress(goal({ kind: "sessions", activity: "speaking", target: 100 }), sessions, [], "2026-11-17")).toMatchObject({ current: 1, pct: 1 }));
  it("consecutive-day streak goal uses only that activity", () => {
    const ss = [1, 2, 3, 5].map((d) => s(`2026-11-0${d}`, "speaking", 10)).concat([s("2026-11-04", "reading", 10)]);
    expect(goalProgress(goal({ kind: "streak", activity: "speaking", target: 30 }), ss, [], "2026-11-17").current).toBe(3);
  });
  it("vocabulary goal can count only learned words", () => {
    const v = [word("a", "learned"), word("b"), word("c", "learned")];
    expect(goalProgress(goal({ kind: "vocab", vocabStatus: "learned", target: 500 }), [], v, "2026-11-17")).toMatchObject({ current: 2, pct: 0 });
    expect(goalProgress(goal({ kind: "vocab", target: 3 }), [], v, "2026-11-17").done).toBe(true);
  });
  it("manual counter goal (articles read)", () => expect(goalProgress(goal({ kind: "counter", target: 20, manualCount: 5 }), [], [], "2026-11-17").pct).toBe(25));
});

describe("badges and records", () => {
  const days = Array.from({ length: 8 }, (_, i) => addDays("2026-11-01", i));
  const ss = days.map((d) => s(d, "reading", 30));
  it("7-day streak badge is earned on the 7th day, not before", () => {
    const b = badges(ss, [], [], history, "2026-11-17");
    expect(b.find((x) => x.id === "streak-7")!.earnedOn).toBe("2026-11-07");
    expect(b.find((x) => x.id === "streak-14")!.earnedOn).toBeNull();
  });
  it("a single tap earns nothing", () => expect(badges([s("2026-11-17", "reading", 1)], [], [], history, "2026-11-17").filter((b) => b.earnedOn)).toHaveLength(0));
  it("hour badge earned on the day the total crosses it", () => {
    const b = badges([s("2026-11-01", "reading", 590), s("2026-11-02", "reading", 10)], [], [], history, "2026-11-17");
    expect(b.find((x) => x.id === "hours-10")!.earnedOn).toBe("2026-11-02");
  });
  it("personal records", () => {
    const r = personalRecords(ledger([...ss, s("2026-11-03", "speaking", 40)]), "2026-11-17");
    expect(r.bestDay).toEqual({ date: "2026-11-03", minutes: 70 });
    expect(r.longestStreak).toBe(8);
  });
  it("next milestone picks the closest unfinished goal/badge", () => {
    const m = nextMilestone([goal({ title: "Hours", kind: "minutes", target: 300 })], ss, [], [], history, "2026-11-17");
    expect(m).toBeTruthy(); expect(m!.pct).toBeGreaterThanOrEqual(0);
  });
});

describe("weakness & neglect tracker", () => {
  const today = "2026-11-17";
  // 14 days: listening every day, speaking never, vocabulary only the first 3 days
  const ss = Array.from({ length: 14 }, (_, i) => addDays("2026-11-04", i)).flatMap((d, i) =>
    [s(d, "listening", 20), s(d, "reading", 10), ...(i < 3 ? [s(d, "vocabulary", 15)] : [])]);
  const obs = observations(ledger(ss), history, today);
  const text = obs.map((o) => o.text).join("\n");
  it("flags never-practised and long-neglected activities with real numbers", () => {
    expect(text).toMatch(/Speaking: no session recorded yet/);
    expect(text).toMatch(/Vocabulary: last practised 11 days ago/);
  });
  it("flags least practised relative to target", () => expect(text).toMatch(/Least practised: Speaking reached 0%/));
  it("flags repeatedly missed targets", () => expect(text).toMatch(/Speaking target \(15 min\) not met on/));
  it("praises consistent activities factually", () => expect(text).toMatch(/Listening: target met on 14 of 14 days/));
  it("detects a stop after a burst (stop-start pattern)", () => {
    const burst = [s("2026-11-01", "listening", 20), s("2026-11-02", "listening", 20), s("2026-11-03", "listening", 20)];
    expect(observations(ledger(burst), history, today).map((o) => o.text).join()).toMatch(/No practice logged for 13 days \(4 November – 16 November\), last practised 3 November/);
  });
  it("says nothing for a brand-new user (no fabricated problems)", () => {
    expect(observations(ledger([]), history, today)).toEqual([]);
    expect(observations(ledger([s(today, "listening", 5)]), history, today).filter((o) => o.level === "attention")).toEqual([]);
  });
});
