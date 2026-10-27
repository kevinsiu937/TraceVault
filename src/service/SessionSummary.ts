export interface SessionSummaryCore {
  readonly sessionId: string;
  readonly parentSessionId: string | null;
  readonly title: string;
  readonly agentName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly eventCount: number;
  readonly gapCount: number;
}

export interface SessionSummary extends SessionSummaryCore {
  readonly lastActivityAt: string;
  readonly filesTouched: number;
  readonly errorCount: number;
  readonly deniedCount: number;
  readonly lastOutcome: string | null;
  readonly density: readonly number[];
  readonly durationMs: number | null;
}
