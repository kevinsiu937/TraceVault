import type { ConfigSubjectKind, RuleSource } from "../../schema/ConfigFinding.js";
import type { Severity } from "../../schema/Finding.js";

export type ConfigCheck =
  /** The agent would make this call, for any one of these example targets, without asking; `configured` ignores OpenCode's defaults. */
  | { readonly kind: "allows"; readonly permission: string; readonly targets: readonly string[]; readonly configured: boolean }
  /** The agent may call an enabled remote MCP server's tools without asking. */
  | { readonly kind: "remote_mcp" }
  /** One of the MCP server's secret key names matches. */
  | { readonly kind: "match"; readonly fact: "secret_keys"; readonly pattern: RegExp };

export interface ConfigAlternative {
  readonly label?: string;
  readonly check: ConfigCheck;
}

/**
 * A loaded `rules/config/*.yaml` file. Each `when` item holds when any of its
 * alternatives does, and a subject is flagged when every item holds.
 */
export class ConfigRule {
  constructor(
    readonly id: string,
    readonly version: number,
    readonly severity: Severity,
    readonly explanation: string,
    readonly source: RuleSource,
    readonly subject: ConfigSubjectKind,
    readonly when: readonly (readonly ConfigAlternative[])[],
  ) {}
}
