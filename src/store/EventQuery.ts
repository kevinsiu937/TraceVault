export interface DurationBound {
  readonly operator: ">" | ">=" | "<";
  readonly milliseconds: number;
}

/** An expression's SQL-able predicates. Duration values are milliseconds. */
export interface ExpressionQuery {
  readonly kinds: readonly string[];
  readonly outcomes: readonly string[];
  readonly targetTerms: readonly string[];
  readonly words: readonly string[];
  readonly durations: readonly DurationBound[];
}

/** Inclusive start-time range; both bounds are canonical ISO-8601 UTC strings. */
export interface TimeRangeQuery {
  readonly from: string;
  readonly to: string;
}

export interface EventQuery {
  readonly sessionId: string | null;
  readonly kinds: readonly string[];
  readonly outcomes: readonly string[];
  readonly operations: readonly string[];
  readonly text: string;
  /** Absent for callers that only use the facet filters. */
  readonly expression?: ExpressionQuery;
  /** Absent when no time range is selected. */
  readonly range?: TimeRangeQuery;
}
