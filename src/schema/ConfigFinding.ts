import type { Severity } from "./Finding.js";

export type RuleSourceKind = "owasp-mcp" | "owasp-agentic" | "cve" | "baseline";

/** Where a static rule comes from. A published source carries its identifier, such as ASI05. */
export interface RuleSource {
  readonly kind: RuleSourceKind;
  readonly id?: string;
  readonly title: string;
}

/**
 * A static rule matched the configuration a session ran under. A read model,
 * computed from the stored snapshot and never stored itself.
 */
export interface ConfigFinding {
  readonly ruleId: string;
  readonly ruleVersion: number;
  readonly ruleSetDigest: string;
  readonly severity: Severity;
  readonly explanation: string;
  readonly source: RuleSource;
  /** The agent the finding is about. */
  readonly subject: string;
  /** A JSON pointer to the configuration entry that decided, or "OpenCode default". */
  readonly entry: string;
  /** The call the agent would make without asking. */
  readonly example: string;
  readonly eventIds: readonly string[];
}
