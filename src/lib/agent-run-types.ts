export type AgentRunView = {
  id: string;
  agent: string;
  planItemId: string | null;
  status: string;
  attempts: number;
  maxDurationSeconds: number;
  queuedAt: Date | string;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  resultCount: number;
  errorMessage: string | null;
};