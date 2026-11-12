import type { Severity } from "./Finding.js";

export type RuleSourceKind = "owasp-mcp" | "owasp-agentic" | "cve" | "baseline";

/** Where a static rule comes from. A published source carries its identifier, such as ASI05. */
export interface RuleSource {
  readonly kind: RuleSourceKind;
  readonly id?: string;
  readonly title: string;
}

export type ConfigSubjectKind = "agent" | "mcp-server" | "tool";

/** One thing a rule found: a call an agent would make without asking, or a credential a server receives. */
export interface ConfigEvidence {
  /** The alternative that held, when the rule offers several. */
  readonly label?: string;
  readonly value: string;
  /** A JSON pointer to the configuration entry behind it, or "OpenCode default". */
  readonly entry: string;
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
  readonly title: string;
  readonly explanation: string;
  readonly recommendation: string;
  readonly source: RuleSource;
  readonly subjectKind: ConfigSubjectKind;
  /** The agent, the MCP server, or the tool as `<server>/<tool>`, the finding is about. */
  readonly subject: string;
  readonly evidence: readonly ConfigEvidence[];
  readonly eventIds: readonly string[];
}
