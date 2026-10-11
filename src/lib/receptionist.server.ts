import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createRunIdFetch, withRunId } from "@/lib/run-id.server";

export async function handleReceptionist(request: Request) {
  let payload: { messages?: UIMessage[] };
  try { payload = await request.json() as { messages?: UIMessage[] }; } catch { return Response.json({ message: "Invalid request." }, { status: 400 }); }
  if (!Array.isArray(payload.messages) || payload.messages.length > 40) return Response.json({ message: "Please start a shorter conversation." }, { status: 400 });
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ message: "The receptionist is not configured yet." }, { status: 401 });
  const gateway = createRunIdFetch(request.headers.get("X-Lovable-AIG-Run-ID") ?? undefined);
  const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" }, fetch: gateway.fetch });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    instructions: "You are Flow, the friendly AI receptionist for ClearFlow Septic, a demo local septic service business. Be concise, calm, and practical. Services: pumping, inspections, cleaning, repairs and risers, maintenance plans, urgent response. Hours: Monday through Saturday, 7 AM to 7 PM. Service area: Clearwater County and surrounding communities. Never invent a fixed price or claim a booking is confirmed. Gather service need, property type, symptoms, address area, preferred timing, and contact details one or two questions at a time. Recommend the booking page once enough detail is known. If there is sewage entering the home, an overflowing tank, electrical danger, or an immediate health hazard, tell the visitor to move away from the area and call (555) 014-7742 now. Do not diagnose hidden system failures with certainty.",
    messages: await convertToModelMessages(payload.messages), abortSignal: request.signal,
    providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] } },
  });
  return withRunId(result.toUIMessageStreamResponse({ originalMessages: payload.messages, sendReasoning: false }), gateway);
}