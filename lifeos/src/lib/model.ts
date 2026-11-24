import type { DateStr } from "./dates";

export const uid = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ---------- planning hierarchy ----------
export const LEVELS = ["four-year", "annual", "quarterly", "monthly", "weekly"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = { "four-year": "Four-year goal", annual: "Annual objective", quarterly: "Quarterly objective", monthly: "Monthly milestone", weekly: "Weekly commitment" };
export const childLevel = (l: Level): Level | null => LEVELS[LEVELS.indexOf(l) + 1] ?? null;

export type ObjStatus = "draft" | "active" | "paused" | "completed" | "partial" | "cancelled" | "archived";
export interface Vision { id: "vision"; statement: string; why: string; horizonStart: DateStr; horizonYears: number; updatedAt: number }
export interface Area { id: string; name: string; createdAt: number }
export interface Objective {
  id: string; title: string; description: string; why: string; areaId: string | null; level: Level; parentId: string | null;
  start: DateStr; target: DateStr; priority: 1 | 2 | 3 | 4; status: ObjStatus;
  completionCriteria: string; evidenceRequired: boolean; createdAt: number; updatedAt: number;
}
export type KrType = "numeric" | "percent" | "currency" | "count" | "binary";
export interface KeyResult { id: string; objectiveId: string; title: string; type: KrType; direction: "up" | "down"; baseline: number; target: number; unit: string; currency: string; createdAt: number }
export interface KrPoint { id: string; krId: string; date: DateStr; value: number; note: string; createdAt: number }

// ---------- tasks, occurrences, sessions, execution ----------
export type Preferred = "any" | "morning" | "afternoon" | "evening";
export interface Recurrence { kind: "none" | "daily" | "weekdays" | "weekly" | "monthly"; days: number[]; interval: number; start: DateStr; until: DateStr | null; count: number | null; paused: boolean }
export interface Task {
  id: string; title: string; notes: string; objectiveId: string | null; priority: 1 | 2 | 3 | 4; estimateMin: number;
  deadline: DateStr | null; earliestStart: DateStr | null; preferred: Preferred; energy: "low" | "medium" | "high";
  flexibility: "fixed" | "flexible"; protectedTask: boolean; recurrence: Recurrence | null; onDate: DateStr | null;
  status: "active" | "cancelled" | "archived"; createdAt: number;
}
export type OccStatus = "planned" | "in-progress" | "done" | "partial" | "skipped" | "missed" | "cancelled";
export interface Occurrence { id: string; taskId: string; date: DateStr; status: OccStatus; moves: number; createdAt: number }
export const occId = (taskId: string, date: DateStr) => `${taskId}@${date}`;
export interface Session { id: string; occId: string; date: DateStr; startMin: number; endMin: number; state: "proposed" | "approved" | "cancelled"; reason: string; createdAt: number }
export interface Execution {
  id: string; occId: string; taskId: string; date: DateStr; startTs: number | null; endTs: number | null; minutes: number;
  outcome: "done" | "partial" | "skipped"; pct: number | null; note: string; reason: string; createdAt: number;
}
export interface Habit { id: string; title: string; objectiveId: string | null; days: number[]; createdAt: number; archived: boolean }
export interface HabitLog { id: string; habitId: string; date: DateStr; createdAt: number }
export interface Evidence { id: string; objectiveId: string | null; krId: string | null; occId: string | null; kind: "note" | "link" | "number" | "file"; text: string; createdAt: number; fileId?: string; fileName?: string; mime?: string; size?: number }
export interface Commitment { id: string; title: string; date: DateStr; startMin: number; endMin: number; source: "manual" | "ics"; externalId: string | null; protectedBlock: boolean; createdAt: number }
export interface Review { id: string; period: "daily" | "weekly" | "monthly" | "quarterly" | "annual"; periodStart: DateStr; wins: string; misses: string; lessons: string; adjustments: string; snapshot: Record<string, number>; createdAt: number }

// ---------- policy, audit ----------
export interface Rules {
  workStart: number; workEnd: number; allowedDays: number[]; maxDailyMin: number; bufferMin: number; minRestMin: number;
  maxAutoMoves: number; maxPostponeDays: number; autoReschedule: boolean; protectedMarginDays: number;
}
export const defaultRules = (): Rules => ({ workStart: 8 * 60, workEnd: 19 * 60, allowedDays: [0, 1, 2, 3, 4, 5], maxDailyMin: 6 * 60, bufferMin: 10, minRestMin: 0, maxAutoMoves: 2, maxPostponeDays: 7, autoReschedule: true, protectedMarginDays: 0 });
export interface Change {
  id: string; occId: string; taskId: string; kind: "schedule" | "reschedule" | "cancel"; auto: boolean; reason: string;
  before: { date: DateStr; startMin: number; endMin: number } | null; after: { date: DateStr; startMin: number; endMin: number } | null;
  beforeOccDate: DateStr; afterOccDate: DateStr; sessionId: string | null; undone: boolean; createdAt: number;
}
export interface AiAudit { id: string; at: number; provider: string; request: string; proposal: string; validation: "accepted" | "rejected"; reasons: string[]; approval: "pending" | "approved" | "declined" | "n/a" }
export interface Settings {
  aiProvider: "gemini" | "gateway"; geminiModel: string;
  rules: Rules; theme: "system" | "light" | "dark"; aiGatewayUrl: string; aiEnabled: boolean; lastBackupAt: number | null;
  remindersEnabled: boolean; reminderLeadMin: number; onboarded: boolean;
}
export const defaultSettings = (): Settings => ({ aiProvider: "gemini", geminiModel: "", rules: defaultRules(), theme: "system", aiGatewayUrl: "", aiEnabled: false, lastBackupAt: null, remindersEnabled: false, reminderLeadMin: 10, onboarded: false });
