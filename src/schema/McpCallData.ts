import type { Outcome } from "./Outcome.js";

export interface McpCallData {
  readonly server: string;
  readonly tool: string;
  readonly args_digest: string;
  readonly args_size_bytes: number;
  readonly outcome: Outcome;
}
