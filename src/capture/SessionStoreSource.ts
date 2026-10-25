export interface AgentSessionRecord {
  readonly id: string;
  readonly title: string;
  readonly agent: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AgentPartRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly data: Record<string, unknown>;
}

export interface SessionStoreSource {
  isAvailable(): boolean;
  listSessions(): AgentSessionRecord[];
  listParts(sessionId: string): AgentPartRecord[];
  close(): void;
}
