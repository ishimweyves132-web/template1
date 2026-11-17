import { addDays, diffDays, type DateStr } from "./dates";
import { uid, type Challenge, type ChallengeDay } from "./model";

export const CHALLENGE_LENGTH = 30;

export interface Block { from: number; to: number; title: string; focus: string; objectives: string[] }
export const BLOCKS: Block[] = [
  { from: 1, to: 5, title: "Introductions & everyday expressions", focus: "Greetings, introducing yourself, polite phrases",
    objectives: ["Say who you are and where you are from, out loud", "Learn and use 5 everyday expressions", "Listen to one short introduction dialogue"] },
  { from: 6, to: 10, title: "Daily routines & surroundings", focus: "Describing your day, home and neighbourhood",
    objectives: ["Describe your morning routine in French", "Name 10 things around you", "Write 3 sentences about your day"] },
  { from: 11, to: 15, title: "Past experiences & storytelling", focus: "Past tenses, telling what happened",
    objectives: ["Tell what you did yesterday", "Read or listen to a short story", "Write a short paragraph in the past tense"] },
  { from: 16, to: 20, title: "Future plans, ambitions & opinions", focus: "Future forms, goals, giving opinions",
    objectives: ["Say what you will do this weekend", "Explain one ambition in French", "Give an opinion and one reason"] },
  { from: 21, to: 25, title: "Longer conversations & spontaneous speaking", focus: "Speaking without preparing",
    objectives: ["Speak for 3 minutes without notes", "Answer a question you did not prepare", "Shadow a native conversation"] },
  { from: 26, to: 30, title: "Debates, storytelling & real-life simulations", focus: "Arguing a view, role-play real situations",
    objectives: ["Argue one side of a topic", "Role-play a real situation (shop, doctor, travel)", "Tell a story with a beginning, middle and end"] },
];
export const blockFor = (day: number) => BLOCKS.find((b) => day >= b.from && day <= b.to)!;

export function newChallenge(startDate: DateStr, name = "30-day challenge"): Challenge {
  return { id: uid(), name, startDate, createdAt: Date.now(), days: {} };
}
export const emptyDay = (): ChallengeDay => ({ done: false, objectives: [false, false, false], note: "" });
export const dayOf = (c: Challenge, n: number): ChallengeDay => c.days[n] ?? emptyDay();

export interface ChallengeStatus {
  scheduledDay: number;     // where the calendar says you are (1..30, can run past 30)
  doneCount: number;
  remaining: number;
  nextDay: number | null;   // first day not yet done: where to resume
  missed: number[];         // scheduled days already past and still not done (never auto-resets)
  finished: boolean;
  notStarted: boolean;
}
export function challengeStatus(c: Challenge, today: DateStr): ChallengeStatus {
  const scheduledDay = diffDays(c.startDate, today) + 1;
  let doneCount = 0, nextDay: number | null = null;
  const missed: number[] = [];
  for (let n = 1; n <= CHALLENGE_LENGTH; n++) {
    const done = dayOf(c, n).done;
    if (done) doneCount++;
    else {
      if (nextDay === null) nextDay = n;
      if (n < scheduledDay) missed.push(n);
    }
  }
  return {
    scheduledDay, doneCount, remaining: CHALLENGE_LENGTH - doneCount, nextDay, missed,
    finished: doneCount === CHALLENGE_LENGTH, notStarted: scheduledDay < 1,
  };
}
export const scheduledDate = (c: Challenge, n: number) => addDays(c.startDate, n - 1);
