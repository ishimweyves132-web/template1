// Google Gemini API, called straight from this device (the API allows browser requests). The key travels only in the
// x-goog-api-key header to generativelanguage.googleapis.com; it is never put in a URL, a log, an error message or a backup.
export const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
type F = typeof fetch;
const redact = (s: string, key: string) => (key ? s.split(key).join("[key]") : s);

async function call(url: string, key: string, init: RequestInit, fetchImpl: F, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res: Response;
  try { res = await fetchImpl(url, { ...init, headers: { "content-type": "application/json", "x-goog-api-key": key }, signal: ctl.signal }); }
  catch (e) { throw new Error(ctl.signal.aborted ? "Gemini did not answer in time." : "Could not reach Gemini. Check your internet connection."); }
  finally { clearTimeout(t); }
  let body: unknown = null; try { body = await res.json(); } catch { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = redact(String((body as { error?: { message?: string } } | null)?.error?.message ?? ""), key).slice(0, 200);
    if (res.status === 400 && /api key|API_KEY/i.test(msg)) throw new Error("Gemini rejected the key. Check that you pasted it completely.");
    if (res.status === 401 || res.status === 403) throw new Error("Gemini refused this key or model (permission denied). Check the key's restrictions and that the API is enabled.");
    if (res.status === 404) throw new Error("That model is not available to your key. Pick another model in Settings.");
    if (res.status === 429) throw new Error("Gemini's rate limit or free quota was reached. Try again later.");
    throw new Error(`Gemini answered HTTP ${res.status}${msg ? ": " + msg : ""}`);
  }
  return body;
}

/** Models the key can use for text generation, newest-looking "flash" models first. Also serves as a "test my key" call. */
export async function listModels(key: string, fetchImpl: F = fetch, timeoutMs = 15000): Promise<string[]> {
  const body = (await call(`${GEMINI_BASE}/models?pageSize=200`, key, { method: "GET" }, fetchImpl, timeoutMs)) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = (body.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m) => m.name.replace(/^models\//, "")).filter((n) => /^gemini-/.test(n) && !/(embedding|image|tts|vision|live|audio|robotics|computer-use)/.test(n));
  return names.sort((a, b) => Number(/flash/.test(b)) - Number(/flash/.test(a)) || b.localeCompare(a, undefined, { numeric: true }));
}

/** One structured-JSON request. Returns the parsed JSON; the caller must still validate it (nothing here is trusted). */
export async function geminiJson(args: { key: string; model: string; system: string; prompt: string; fetchImpl?: F; timeoutMs?: number }): Promise<unknown> {
  const { key, model, system, prompt, fetchImpl = fetch, timeoutMs = 45000 } = args;
  if (!/^[a-z0-9.\-]+$/i.test(model)) throw new Error("Choose a model in Settings first.");
  const body = (await call(`${GEMINI_BASE}/models/${model}:generateContent`, key, { method: "POST", body: JSON.stringify({
    systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3 },
  }) }, fetchImpl, timeoutMs)) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (body.promptFeedback?.blockReason) throw new Error(`Gemini declined this request (${body.promptFeedback.blockReason.toLowerCase()}).`);
  const text = (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini returned no answer.");
  const unfenced = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(unfenced); } catch { throw new Error("Gemini's answer was not valid JSON, so it was ignored."); }
}

// ---------- function calling (the autonomous assistant) ----------
export interface GPart { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> }; [k: string]: unknown }
export interface GContent { role: "user" | "model"; parts: GPart[] }
/** One tool-enabled turn. The model's content is returned untouched: it must be sent back verbatim (it can carry signatures the API checks). */
export async function geminiChat(args: { key: string; model: string; system: string; contents: GContent[]; tools: { name: string; description: string; parameters: unknown }[]; fetchImpl?: F; timeoutMs?: number }): Promise<GContent> {
  const { key, model, system, contents, tools, fetchImpl = fetch, timeoutMs = 90000 } = args;
  if (!/^[a-z0-9.\-]+$/i.test(model)) throw new Error("Choose a model in Settings first.");
  const body = (await call(`${GEMINI_BASE}/models/${model}:generateContent`, key, { method: "POST", body: JSON.stringify({
    systemInstruction: { parts: [{ text: system }] }, contents, tools: [{ functionDeclarations: tools }], generationConfig: { temperature: 0.4 },
  }) }, fetchImpl, timeoutMs)) as { candidates?: { content?: GContent; finishReason?: string }[]; promptFeedback?: { blockReason?: string } };
  if (body.promptFeedback?.blockReason) throw new Error(`Gemini declined this request (${body.promptFeedback.blockReason.toLowerCase()}).`);
  const c = body.candidates?.[0]?.content; if (!c || !Array.isArray(c.parts) || !c.parts.length) throw new Error("Gemini returned no answer. Try rephrasing.");
  return { role: "model", parts: c.parts };
}
