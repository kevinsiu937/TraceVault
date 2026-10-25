export interface EventQuery {
  readonly sessionId: string | null;
  readonly kinds: readonly string[];
  readonly outcomes: readonly string[];
  readonly operations: readonly string[];
  readonly text: string;
}
