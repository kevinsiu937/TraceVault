export interface StoredSession {
  readonly sessionId: string;
  readonly title: string;
  readonly agentName: string;
  readonly startedAt: string;
  readonly lastAt: string;
  readonly lastType: string;
  readonly eventCount: number;
}
