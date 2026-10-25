import type { Outcome } from "./Outcome.js";

export interface HookScriptData {
  readonly hook: string;
  readonly target_tool: string;
  readonly target: string;
  readonly exit_code: number | null;
  readonly outcome: Outcome;
}
