import type { AgentRunView } from "@/lib/agent-run-types";

export async function waitForAgentRun(
  runId: string,
  onUpdate: (run: AgentRunView) => void,
  signal?: AbortSignal,
): Promise<AgentRunView | null> {
  for (let attempt = 0; attempt < 75; attempt++) {
    if (signal?.aborted) return null;
    const response = await fetch(`/api/agent-runs/${encodeURIComponent(runId)}`, { signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.run) throw new Error(data?.error ?? "Impossible de suivre l'exécution.");
    const run = data.run as AgentRunView;
    onUpdate(run);
    if (run.status === "succeeded" || run.status === "failed") return run;
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return null;
}