import type { Outcome } from "./Outcome.js";

export interface SkillCallData {
  readonly skill: string;
  readonly invoker: "model" | "user" | "plugin" | "unknown";
  readonly params_digest: string;
  readonly params_size_bytes: number;
  readonly outcome: Outcome;
  /** The blockable rule the opt-in guard refused this call with. */
  readonly blocked_by?: string;
}
