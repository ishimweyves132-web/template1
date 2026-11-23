// Optional example plan so a new user (and the screenshots) can see a whole life plan. Clearly labelled; erase any time in Settings.
import { addDays, type DateStr } from "./dates";
import { occId, uid, type Area, type Commitment, type Execution, type Habit, type HabitLog, type KeyResult, type KrPoint, type Objective, type Occurrence, type Task, type Vision } from "./model";
import { recurrenceDates } from "../domain/recurrence";

export interface DemoData { vision: Vision; areas: Area[]; objectives: Objective[]; krs: KeyResult[]; krPoints: KrPoint[]; tasks: Task[]; occurrences: Occurrence[]; executions: Execution[]; habits: Habit[]; habitLogs: HabitLog[]; commitments: Commitment[] }
export function demoData(today: DateStr, now = Date.now()): DemoData {
  const y0 = addDays(today, -60); const y4 = addDays(today, 365 * 4 - 60);
  const area = (name: string): Area => ({ id: uid(), name, createdAt: now });
  const areas = [area("Career & craft"), area("Health"), area("Finances"), area("Learning")];
  const obj = (p: Partial<Objective> & Pick<Objective, "title" | "level">): Objective => ({ id: uid(), description: "", why: "", areaId: null, parentId: null, start: y0, target: y4, priority: 2, status: "active", completionCriteria: "", evidenceRequired: false, createdAt: now, updatedAt: now, ...p });
  const g1 = obj({ title: "Become a published author", level: "four-year", areaId: areas[0]!.id, why: "I want my ideas to outlast my working years.", completionCriteria: "A book is published and sold to real readers." });
  const g2 = obj({ title: "Be physically strong at 40", level: "four-year", areaId: areas[1]!.id, why: "Energy is the base of everything else.", priority: 1 });
  const g3 = obj({ title: "Build 12 months of savings", level: "four-year", areaId: areas[2]!.id, evidenceRequired: true });
  const a1 = obj({ title: "Finish the first draft", level: "annual", parentId: g1.id, areaId: areas[0]!.id, target: addDays(today, 300) });
  const a2 = obj({ title: "Run a half marathon", level: "annual", parentId: g2.id, areaId: areas[1]!.id, target: addDays(today, 280) });
  const a3 = obj({ title: "Save the first 4 months", level: "annual", parentId: g3.id, areaId: areas[2]!.id, target: addDays(today, 330), evidenceRequired: true });
  const q1 = obj({ title: "Write chapters 1 to 4", level: "quarterly", parentId: a1.id, areaId: areas[0]!.id, target: addDays(today, 75), start: addDays(today, -15) });
  const q2 = obj({ title: "Build a 10 km base", level: "quarterly", parentId: a2.id, areaId: areas[1]!.id, target: addDays(today, 70), start: addDays(today, -20) });
  const objectives = [g1, g2, g3, a1, a2, a3, q1, q2];
  const kr = (o: Objective, title: string, type: KeyResult["type"], direction: KeyResult["direction"], baseline: number, target: number, unit: string): KeyResult => ({ id: uid(), objectiveId: o.id, title, type, direction, baseline, target, unit, currency: type === "currency" ? "EUR" : "", createdAt: now });
  const k1 = kr(q1, "Words written", "count", "up", 0, 40000, "words"); const k2 = kr(q2, "Longest run", "numeric", "up", 3, 10, "km"); const k3 = kr(a3, "Savings", "currency", "up", 1200, 9600, "EUR"); const k4 = kr(g2, "Resting heart rate", "numeric", "down", 68, 55, "bpm");
  const krs = [k1, k2, k3, k4];
  const pt = (k: KeyResult, daysAgo: number, value: number): KrPoint => ({ id: uid(), krId: k.id, date: addDays(today, -daysAgo), value, note: "", createdAt: now });
  const krPoints = [pt(k1, 14, 6000), pt(k1, 7, 11500), pt(k1, 1, 15200), pt(k2, 12, 4), pt(k2, 5, 6), pt(k3, 20, 2100), pt(k3, 2, 3400), pt(k4, 10, 66)];
  const task = (p: Partial<Task> & Pick<Task, "title">): Task => ({ id: uid(), notes: "", objectiveId: null, priority: 2, estimateMin: 45, deadline: null, earliestStart: null, preferred: "any", energy: "medium", flexibility: "flexible", protectedTask: false, recurrence: null, onDate: null, status: "active", createdAt: now, ...p });
  const rec = (kind: "daily" | "weekdays" | "weekly", days: number[] = []) => ({ kind, days, interval: 1, start: addDays(today, -21), until: null, count: null, paused: false });
  const write = task({ title: "Write 600 words", objectiveId: q1.id, estimateMin: 90, priority: 1, preferred: "morning", energy: "high", recurrence: rec("weekdays") });
  const run = task({ title: "Easy run", objectiveId: q2.id, estimateMin: 45, preferred: "evening", recurrence: rec("weekly", [1, 3, 5]) });
  const longRun = task({ title: "Long run", objectiveId: q2.id, estimateMin: 80, recurrence: rec("weekly", [5]) });
  const outline = task({ title: "Outline chapter 5", objectiveId: q1.id, estimateMin: 60, priority: 2, onDate: today, deadline: addDays(today, 4) });
  const budget = task({ title: "Review the monthly budget", objectiveId: a3.id, estimateMin: 40, onDate: addDays(today, 1), deadline: addDays(today, 6), preferred: "afternoon" });
  const doctor = task({ title: "Book a health check", objectiveId: g2.id, estimateMin: 15, onDate: today, priority: 3 });
  const tasks = [write, run, longRun, outline, budget, doctor];
  const occurrences: Occurrence[] = []; const executions: Execution[] = [];
  for (const t of [write, run, longRun]) for (const d of recurrenceDates(t.recurrence!, addDays(today, -21), addDays(today, 14))) {
    const past = d < today; const roll = (d.charCodeAt(9) + t.title.length) % 5;
    const status = past ? (roll === 0 ? "missed" : roll === 1 ? "partial" : "done") : "planned";
    occurrences.push({ id: occId(t.id, d), taskId: t.id, date: d, status, moves: 0, createdAt: now });
    if (status === "done" || status === "partial") executions.push({ id: uid(), occId: occId(t.id, d), taskId: t.id, date: d, startTs: null, endTs: null, minutes: status === "done" ? t.estimateMin + (roll % 3) * 5 : Math.round(t.estimateMin / 2), outcome: status, pct: status === "done" ? 100 : 50, note: "", reason: status === "partial" ? "ran out of time" : "", createdAt: now });
  }
  for (const t of [outline, budget, doctor]) occurrences.push({ id: occId(t.id, t.onDate!), taskId: t.id, date: t.onDate!, status: "planned", moves: 0, createdAt: now });
  const h = (title: string, days: number[] = []): Habit => ({ id: uid(), title, objectiveId: null, days, createdAt: now, archived: false });
  const habits = [h("Read 20 pages"), h("Lights out by 23:00"), h("Strength session", [0, 2, 4])];
  const habitLogs: HabitLog[] = []; for (const hb of habits) for (let i = 1; i <= 14; i++) { const d = addDays(today, -i); if ((i * 7 + hb.title.length) % 4 !== 0) habitLogs.push({ id: uid(), habitId: hb.id, date: d, createdAt: now }); }
  const commit = (title: string, daysAhead: number, s: number, e: number): Commitment => ({ id: uid(), title, date: addDays(today, daysAhead), startMin: s, endMin: e, source: "manual", externalId: null, protectedBlock: false, createdAt: now });
  const commitments = [commit("Team meeting", 0, 14 * 60, 15 * 60), commit("Dentist", 2, 9 * 60, 10 * 60), commit("Team meeting", 1, 14 * 60, 15 * 60), commit("Lunch with Sam", 3, 12 * 60 + 30, 13 * 60 + 30)];
  const vision: Vision = { id: "vision", statement: "A calm, strong life where I make things that matter and have the freedom to choose my work.", why: "I only get so many weeks. I want them to add up to something I chose.", horizonStart: y0, horizonYears: 4, updatedAt: now };
  return { vision, areas, objectives, krs, krPoints, tasks, occurrences, executions, habits, habitLogs, commitments };
}
