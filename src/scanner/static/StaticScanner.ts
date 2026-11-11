import type { ConfigFinding } from "../../schema/ConfigFinding.js";
import type { AllowsCheck, ConfigRule } from "./ConfigRule.js";
import { EffectivePermissions } from "./EffectivePermissions.js";
import type { ConfigSnapshotEvent, StaticScannerPort } from "./StaticScannerPort.js";

export interface ConfigRuleSet {
  readonly rules: readonly ConfigRule[];
  /** Covers every rule file read, so a rule edit shows on every finding. */
  readonly digest: string;
}

export class StaticScanner implements StaticScannerPort {
  constructor(private readonly ruleSet: ConfigRuleSet) {}

  scan(snapshot: ConfigSnapshotEvent): ConfigFinding[] {
    const permissions = EffectivePermissions.of(snapshot.data.config);
    return this.ruleSet.rules.flatMap((rule) =>
      permissions.agents().flatMap((agent) => {
        const allowed = rule.checks.map((check) => this.allowed(permissions, agent, check));
        const [first] = allowed;
        if (first === undefined || first === null || allowed.includes(null)) {
          return [];
        }
        return [
          {
            ruleId: rule.id,
            ruleVersion: rule.version,
            ruleSetDigest: this.ruleSet.digest,
            severity: rule.severity,
            explanation: rule.explanation,
            source: rule.source,
            subject: agent,
            entry: first.entry,
            example: first.example,
            eventIds: [snapshot.id],
          },
        ];
      }),
    );
  }

  /** The first example this agent would run without asking, and the entry that lets it; null when none. */
  private allowed(permissions: EffectivePermissions, agent: string, check: AllowsCheck): { example: string; entry: string } | null {
    for (const example of check.targets) {
      const decision = permissions.decide(agent, check.permission, example);
      if (decision.action === "allow") {
        return { example, entry: decision.entry };
      }
    }
    return null;
  }
}
