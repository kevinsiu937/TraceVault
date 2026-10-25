import type { Outcome } from "./Outcome.js";

export type DocumentOperation = "read" | "write" | "delete" | "rename";

export interface DocumentAccessData {
  readonly path: string;
  readonly operation: DocumentOperation;
  readonly outcome: Outcome;
}
