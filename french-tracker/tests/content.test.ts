import { describe, expect, it } from "vitest";
import { WORDS } from "../src/data/words";
import { PHRASES, PHRASE_CATEGORIES } from "../src/data/phrases";
import { TIPS, tipFor } from "../src/data/playbook";
import { BUILTIN_WORD_COUNT, searchBuiltin, searchByMeaning, searchPhrases } from "../src/lib/builtin";
import { INTERVALS, dueList, isDue, nextDue } from "../src/lib/review";
import { todaysBoost } from "../src/lib/boost";
import { ACTIVITIES, uid, type VocabEntry } from "../src/lib/model";
import { history, ledger, s } from "./helpers";

const v = (p: Partial<VocabEntry> = {}): VocabEntry => ({ id: uid(), fr: "x", en: "", example: "", notes: "", addedAt: "2026-11-10", status: "learning", reviews: [], source: "manual", ...p });

describe("built-in dictionary data", () => {
  it("every word is complete and unique", () => {
    expect(WORDS.length).toBe(BUILTIN_WORD_COUNT);
    expect(new Set(WORDS.map((w) => w.w)).size).toBe(WORDS.length);
    for (const w of WORDS) {
      expect(w.w && w.p && w.en && w.fr && w.fe, w.w).toBeTruthy();
      expect(["", "m", "f", "mf"]).toContain(w.g);
      expect(w.fr.length).toBeGreaterThan(5);
    }
  });
  it("nouns declare a gender; verbs are infinitives; no placeholder text", () => {
    for (const w of WORDS.filter((x) => x.p === "noun")) expect(w.g, `${w.w} needs a gender`).not.toBe("");
    for (const w of WORDS.filter((x) => x.p === "verb")) expect(w.en.startsWith("to "), w.w).toBe(true);
    expect(JSON.stringify(WORDS)).not.toMatch(/TODO|lorem|xxx/i);
  });
  it("searches accent-insensitively, exact first, with gender and example", () => {
    expect(searchBuiltin("ecole")[0]).toMatchObject({ w: "école", g: "f" });
    expect(searchBuiltin("ETRE")[0]!.w).toBe("être");
    expect(searchBuiltin("ho").map((e) => e.w)).toEqual(expect.arrayContaining(["homme", "hôtel"]));
    const maison = searchBuiltin("maison")[0]!;
    expect(maison.x![0]!.f).toMatch(/maison/); expect(maison.d[0]!.l).toBe("en");
    expect(searchBuiltin("")).toEqual([]); expect(searchBuiltin("zzzzqq")).toEqual([]);
  });
  it("finds French words from an English meaning", () => {
    expect(searchByMeaning("tired").map((e) => e.w)).toContain("fatigué");
    expect(searchByMeaning("kitchen").map((e) => e.w)).toContain("cuisine");
    expect(searchByMeaning("it")).toEqual([]); // too short to be useful
  });
});

describe("built-in phrasebook data", () => {
  it("is complete, categorised and unique", () => {
    expect(PHRASES.length).toBeGreaterThanOrEqual(100);
    expect(PHRASE_CATEGORIES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PHRASES.map((p) => p.fr)).size).toBe(PHRASES.length);
    for (const p of PHRASES) expect(p.cat && p.fr && p.en, p.fr).toBeTruthy();
  });
  it("searches by French, English and category", () => {
    expect(searchPhrases("addition", "").map((p) => p.fr)).toContain("L'addition, s'il vous plaît.");
    expect(searchPhrases("I'm lost", "")[0]!.fr).toMatch(/perdu/);
    expect(searchPhrases("", "Politeness").every((p) => p.cat === "Politeness")).toBe(true);
    expect(searchPhrases("dependent", "")).toEqual([]);
  });
});

describe("playbook", () => {
  it("has a tip for every activity and every tip is actionable", () => {
    for (const a of ACTIVITIES) expect(tipFor(a).activity).toBe(a);
    for (const t of TIPS) { expect(t.steps.length).toBeGreaterThanOrEqual(3); expect(t.why.length).toBeGreaterThan(20); }
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
  });
  it("makes no unsupported speed claims", () => expect(JSON.stringify(TIPS)).not.toMatch(/\bguarantee|in \d+ days|fluent in/i));
});

describe("spaced review", () => {
  it("schedules at 1, 3, 7, 14, 30, 60 days from the last review", () => {
    expect(INTERVALS).toEqual([1, 3, 7, 14, 30, 60]);
    expect(nextDue(v({ addedAt: "2026-11-10" }))).toBe("2026-11-11");
    expect(nextDue(v({ addedAt: "2026-11-10", reviews: ["2026-11-11"] }))).toBe("2026-11-14");
    expect(nextDue(v({ addedAt: "2026-11-10", reviews: ["2026-11-11", "2026-11-14"] }))).toBe("2026-11-21");
    expect(nextDue(v({ reviews: Array(9).fill("2026-11-11") }))).toBe("2027-01-10"); // caps at 60 days
  });
  it("a word added today is due tomorrow, not today; reviewing pushes it out", () => {
    expect(isDue(v({ addedAt: "2026-11-18" }), "2026-11-18")).toBe(false);
    expect(isDue(v({ addedAt: "2026-11-18" }), "2026-11-19")).toBe(true);
    expect(isDue(v({ addedAt: "2026-11-10", reviews: ["2026-11-18"] }), "2026-11-18")).toBe(false);
  });
  it("learned words are not scheduled; due list is oldest-first", () => {
    const a = v({ fr: "a", addedAt: "2026-11-05" }), b = v({ fr: "b", addedAt: "2026-11-01" }), c = v({ fr: "c", status: "learned", addedAt: "2026-01-01" });
    expect(dueList([a, b, c], "2026-11-18").map((x) => x.fr)).toEqual(["b", "a"]);
  });
});

describe("today's boost", () => {
  const today = "2026-11-18";
  it("after a missed day, says never miss twice", () => {
    const l = ledger([s("2026-11-14", "listening", 20), s("2026-11-15", "listening", 20), s("2026-11-16", "listening", 20)]);
    expect(todaysBoost(l, history, today).tip.id).toBe("never-twice");
  });
  it("otherwise targets the most neglected activity from real records", () => {
    const ss = ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"].flatMap((d) => (["listening", "vocabulary", "grammar", "reading", "writing"] as const).map((a) => s(d, a, 30)));
    const b = todaysBoost(ledger(ss), history, today);
    expect(b.tip.activity).toBe("speaking"); expect(b.reason).toMatch(/Speaking/);
  });
  it("with no records, offers a starter tip without inventing problems", () => {
    const b = todaysBoost(ledger([]), history, today); expect(b.reason).toMatch(/first habit/);
  });
});

import { planReminders } from "../src/lib/reminders";
describe("native reminder plan", () => {
  const at = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  it("before today's time: starts today, 14 consecutive days", () => {
    const p = planReminders(new Date(2026, 10, 18, 9, 0), "19:00", false);
    expect(p.length).toBe(14); expect(at(p[0]!)).toBe("2026-11-18 19:00"); expect(at(p[13]!)).toBe("2026-12-1 19:00");
  });
  it("after today's time: starts tomorrow", () => expect(at(planReminders(new Date(2026, 10, 18, 20, 0), "19:00", false)[0]!)).toBe("2026-11-19 19:00"));
  it("already practised today: today is skipped, tomorrow onward kept", () => {
    const p = planReminders(new Date(2026, 10, 18, 9, 0), "19:00", true);
    expect(p.length).toBe(13); expect(at(p[0]!)).toBe("2026-11-19 19:00");
  });
  it("crosses a month and a year boundary", () => expect(at(planReminders(new Date(2026, 11, 30, 8, 0), "07:30", false, 4)[0]!)).toBe("2026-12-31 7:30"));
});
