export interface StoredSession {
  readonly sessionId: string;
  readonly parentSessionId: string | null;
  readonly title: string;
  readonly agentName: string;
  readonly startedAt: string;
  readonly lastAt: string;
  readonly lastType: string;
  readonly eventCount: number;
  readonly gapCount: number;
  readonly filesTouched: number;
  readonly errorCount: number;
  readonly deniedCount: number;
  readonly lastOutcome: string | null;
}
