const HEADER = "X-Lovable-AIG-Run-ID";
export function createRunIdFetch(initialRunId?: string) {
  let runId = initialRunId?.trim() || undefined;
  let resolveReady: (value: string | undefined) => void = () => {};
  let resolved = false;
  const ready = new Promise<string | undefined>((resolve) => { resolveReady = resolve; });
  const publish = (value?: string) => { if (!runId && value?.trim()) runId = value.trim(); if (!resolved) { resolved = true; resolveReady(runId); } };
  if (runId) publish(runId);
  return { fetch: async (input: RequestInfo | URL, init?: RequestInit) => { const headers = new Headers(init?.headers); if (runId) headers.set(HEADER, runId); try { const response = await fetch(input, { ...init, headers }); publish(response.headers.get(HEADER) ?? undefined); return response; } catch (error) { publish(); throw error; } }, getRunId: () => runId, waitForRunId: () => runId ? Promise.resolve(runId) : ready };
}
export async function withRunId(response: Response, gateway: ReturnType<typeof createRunIdFetch>) {
  if (!response.body) return response;
  const reader = response.body.getReader(); const first = reader.read(); const runId = await gateway.waitForRunId(); const headers = new Headers(response.headers); if (runId) { headers.set(HEADER, runId); headers.set("Access-Control-Expose-Headers", HEADER); }
  const body = new ReadableStream({ async start(controller) { try { const chunk = await first; if (!chunk.done) controller.enqueue(chunk.value); while (true) { const next = await reader.read(); if (next.done) break; controller.enqueue(next.value); } controller.close(); } catch (error) { controller.error(error); } }, cancel: (reason) => reader.cancel(reason) });
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}