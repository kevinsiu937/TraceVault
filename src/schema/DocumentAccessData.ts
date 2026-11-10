import type { Outcome } from "./Outcome.js";

export type DocumentOperation = "read" | "write" | "delete" | "rename";

export interface DocumentAccessData {
  readonly path: string;
  readonly operation: DocumentOperation;
  readonly outcome: Outcome;
  /** The blockable rule the opt-in guard refused this call with. */
  readonly blocked_by?: string;
}
