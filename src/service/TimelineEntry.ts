export interface TimelineEntry {
  readonly eventId: string;
  readonly type: string;
  readonly target: string;
  readonly outcome: string;
  readonly time: string;
  readonly durationMs: number | null;
  readonly gapFrom: string | null;
  readonly gapTo: string | null;
  readonly operation: string | null;
  /** False for boundaries and capture bookkeeping, which never count as something the agent did. */
  readonly isCall: boolean;
  /** A prompt the agent injected itself; it never starts a turn and is never shown. */
  readonly isHarnessPrompt: boolean;
  readonly detail: string;
  /** Rule ids of the findings that name this event, scanned over the whole session. */
  readonly flags: readonly string[];
  /** The rule the opt-in guard refused this call under, or null when the guard did not skip it. */
  readonly blockedBy: string | null;
}
