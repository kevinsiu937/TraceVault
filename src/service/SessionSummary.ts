export interface SessionSummary {
  readonly sessionId: string;
  readonly title: string;
  readonly agentName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly eventCount: number;
}
