import type { Db } from "./db";
import type { Objective, Settings } from "./model";
import { childLevel, LEVEL_LABEL } from "./model";
import { geminiJson } from "./gemini";
import { loadKey } from "./aikey";
import { callGateway } from "../domain/aiGuard";

export const SYSTEM_PROMPT = `You are the planning assistant inside a personal life-planning app called LifeOS.
You only SUGGEST. A rules engine validates every suggestion and the user must approve it. You can never change, delete or complete existing goals, targets, deadlines, rules or calendar events.
Reply with ONLY a JSON object: {"operations": [ ... ]} (at most 8 operations) using exactly these shapes:
 {"op":"propose_schedule","taskId":"<id>","occId":"<id>","date":"YYYY-MM-DD","startMin":<minutes after midnight>,"endMin":<minutes after midnight>,"why":"<short reason>"}
 {"op":"propose_task","title":"<specific next action>","estimateMin":<5-480>,"objectiveId":"<id or null>","priority":<1-4, 1 is highest>,"onDate":"YYYY-MM-DD or null","why":"<short reason>"}
 {"op":"propose_objective","parentId":"<id>","title":"<measurable outcome>","why":"<short reason>","start":"YYYY-MM-DD","target":"YYYY-MM-DD"}
 {"op":"advice","text":"<one or two plain sentences>"}
Rules: use only ids and free time windows you are given; schedule inside the free windows with room for the estimate; keep every date inside the parent's dates; prefer few, concrete, measurable items; never invent ids; no text outside the JSON.`;

export interface AiStatus { ready: boolean; why: string }
export async function aiStatus(db: Db, s: Settings): Promise<AiStatus> {
  if (s.aiProvider === "gateway") return /^https?:\/\//.test(s.aiGatewayUrl) ? { ready: true, why: "" } : { ready: false, why: "Add your gateway address in Settings." };
  if (!(await loadKey(db))) return { ready: false, why: "Paste your Gemini API key in Settings." };
  if (!s.geminiModel) return { ready: false, why: "Choose a Gemini model in Settings (tap “Test key and load models”)." };
  return { ready: true, why: "" };
}
export const aiTarget = (s: Settings) => (s.aiProvider === "gemini" ? `Google Gemini (${s.geminiModel || "no model chosen"})` : (() => { try { return new URL(s.aiGatewayUrl).host; } catch { return "your gateway"; } })());
/** Sends the request to the chosen provider and returns RAW output. Callers must run it through validateAi before using anything. */
export async function askModel(db: Db, s: Settings, request: unknown, fetchImpl?: typeof fetch): Promise<unknown> {
  if (s.aiProvider === "gateway") return callGateway(s.aiGatewayUrl, request, fetchImpl);
  const key = await loadKey(db); if (!key) throw new Error("Paste your Gemini API key in Settings.");
  return geminiJson({ key, model: s.geminiModel, system: SYSTEM_PROMPT, prompt: JSON.stringify(request), ...(fetchImpl ? { fetchImpl } : {}) });
}
/** The minimum context for "break this objective down": the objective itself and its children's titles. Nothing else leaves the device. */
export function buildBreakdownRequest(o: Objective, children: Objective[]) {
  return { task: "Suggest sub-objectives (and a few first tasks) that move this objective forward. Each sub-objective needs a measurable outcome.", objective: { id: o.id, level: o.level, title: o.title.slice(0, 120), why: o.why.slice(0, 200), start: o.start, target: o.target, nextLevelToCreate: childLevel(o.level) ? LEVEL_LABEL[childLevel(o.level)!] : null }, existingChildren: children.map((c) => c.title.slice(0, 80)), allowedOperations: ["propose_objective", "propose_task", "advice"] };
}
