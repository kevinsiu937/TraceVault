export interface TimelineEntry {
  readonly eventId: string;
  readonly type: string;
  readonly target: string;
  readonly outcome: string;
  readonly time: string;
  readonly durationMs: number | null;
  readonly operation: string | null;
  readonly detail: string;
}
