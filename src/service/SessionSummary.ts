export interface SessionSummary {
  readonly sessionId: string;
  readonly parentSessionId: string | null;
  readonly title: string;
  readonly agentName: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly lastActivityAt: string;
  readonly eventCount: number;
  readonly gapCount: number;
  readonly filesTouched: number;
  readonly errorCount: number;
  readonly deniedCount: number;
  readonly lastOutcome: string | null;
  readonly density: readonly number[];
  readonly durationMs: number | null;
}
