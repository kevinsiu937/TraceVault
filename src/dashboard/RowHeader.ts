export interface RowPill {
  readonly outcome: string;
  readonly label: string;
}

/**
 * Everything the one-line row header shows. A single event and a repeated run
 * each build one, and RowHeaderView draws both the same way.
 */
export interface RowHeader {
  readonly time: string;
  readonly kind: string;
  readonly target: string;
  /** How many calls the row stands for; null for a single event. */
  readonly count: number | null;
  readonly durationMs: number | null;
  readonly pills: readonly RowPill[];
  /** Rule ids flagging this row; a run carries every flag of its calls. */
  readonly flags: readonly string[];
}
