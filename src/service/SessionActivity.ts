import type { TimelineEntry } from "./TimelineEntry.js";

export interface SessionActivity {
  readonly sessionId: string;
  readonly title: string;
  readonly agentName: string;
  readonly startedAt: string;
  readonly entries: readonly TimelineEntry[];
}
