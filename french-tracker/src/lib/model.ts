import type { DateStr } from "./dates";

export const ACTIVITIES = [
  "listening", "speaking", "vocabulary", "grammar", "reading", "writing", "shadowing", "immersion",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const ACTIVITY_LABEL: Record<Activity, string> = {
  listening: "Listening", speaking: "Speaking", vocabulary: "Vocabulary", grammar: "Grammar",
  reading: "Reading", writing: "Writing", shadowing: "Shadowing", immersion: "Immersion",
};
export const ACTIVITY_HINT: Record<Activity, string> = {
  listening: "Podcasts, videos, radio", speaking: "Out loud, with others or alone",
  vocabulary: "New words and reviewing saved ones", grammar: "Rules through real examples",
  reading: "Articles, books, signs", writing: "Messages, journal, summaries",
  shadowing: "Imitating native speakers", immersion: "French in everyday life",
};

export type Targets = Record<Activity, number>;
/** Your standard routine: 80 minutes. Shadowing and immersion are tracked but optional (target 0). */
export const DEFAULT_TARGETS: Targets = {
  listening: 20, speaking: 15, vocabulary: 15, grammar: 10, reading: 10, writing: 10, shadowing: 0, immersion: 0,
};

export interface Session {
  id: string;
  date: DateStr;
  activity: Activity;
  minutes: number; // whole minutes actually practised
  learned: string;
  difficulties: string;
  notes: string;
  source: "timer" | "manual";
  createdAt: number;
}
/** User explicitly marked an activity as done for a day (does not change minutes). */
export interface Mark { key: string; date: DateStr; activity: Activity }
export const markKey = (date: DateStr, activity: Activity) => `${date}|${activity}`;

export type VocabStatus = "learning" | "learned";
export interface VocabEntry {
  id: string;
  fr: string;
  en: string;
  example: string;
  notes: string;
  addedAt: DateStr;
  status: VocabStatus;
  reviews: DateStr[]; // every date the user recorded a review
  source: "manual" | "dictionary";
}

export type GoalKind = "minutes" | "sessions" | "streak" | "vocab" | "counter";
export interface Goal {
  id: string;
  title: string;
  kind: GoalKind;
  activity: Activity | "any";
  target: number;      // minutes→hours are entered by the user and stored as minutes; others are counts/days
  startDate: DateStr;
  manualCount: number; // only used by "counter" goals (e.g. articles read)
  vocabStatus: VocabStatus | "any"; // only used by "vocab" goals
  createdAt: number;
  completedAt?: DateStr;
}

export interface ChallengeDay { done: boolean; doneOn?: DateStr; objectives: boolean[]; note: string }
export interface Challenge {
  id: string;
  name: string;
  startDate: DateStr;
  createdAt: number;
  archivedAt?: number;
  days: Record<number, ChallengeDay>;
}

export interface TargetEra { from: DateStr; targets: Targets }
export interface ReminderSettings { enabled: boolean; time: string; lastShown: DateStr | "" }
export interface ActiveTimer { activity: Activity; startedAt: number }
export interface DictMeta {
  installed: boolean; version: string; count: number; size: number; license: string; source: string;
  installedAt: number; url: string;
}
export interface Settings {
  targetHistory: TargetEra[];
  reminders: ReminderSettings;
  activeTimer: ActiveTimer | null;
  dictUrl: string;
  dict: DictMeta | null;
  lastExportAt: number | null;
}
export const defaultSettings = (): Settings => ({
  targetHistory: [{ from: "0000-01-01", targets: { ...DEFAULT_TARGETS } }],
  reminders: { enabled: false, time: "19:00", lastShown: "" },
  activeTimer: null,
  dictUrl: "./dict/manifest.json",
  dict: null,
  lastExportAt: null,
});

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
