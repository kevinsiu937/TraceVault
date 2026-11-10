import type { Outcome } from "./Outcome.js";

export interface McpCallData {
  readonly server: string;
  readonly tool: string;
  readonly args_digest: string;
  readonly args_size_bytes: number;
  readonly outcome: Outcome;
  /** The blockable rule the opt-in guard refused this call with. */
  readonly blocked_by?: string;
}
