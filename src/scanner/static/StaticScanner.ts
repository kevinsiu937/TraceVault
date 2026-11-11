import type { ConfigEvidence, ConfigFinding } from "../../schema/ConfigFinding.js";
import type { ConfigCheck, ConfigRule } from "./ConfigRule.js";
import { EffectivePermissions } from "./EffectivePermissions.js";
import { type McpServer, McpServers } from "./McpServers.js";
import type { ConfigSnapshotEvent, StaticScannerPort } from "./StaticScannerPort.js";

export interface ConfigRuleSet {
  readonly rules: readonly ConfigRule[];
  /** Covers every rule file read, so a rule edit shows on every finding. */
  readonly digest: string;
}

type Found = Omit<ConfigEvidence, "label">;

export class StaticScanner implements StaticScannerPort {
  constructor(private readonly ruleSet: ConfigRuleSet) {}

  scan(snapshot: ConfigSnapshotEvent): ConfigFinding[] {
    const permissions = EffectivePermissions.of(snapshot.data.config);
    const servers = McpServers.of(snapshot.data.config);
    const subjects = { agent: permissions.agents(), "mcp-server": servers.map((server) => server.name) };

    return this.ruleSet.rules.flatMap((rule) =>
      subjects[rule.subject].flatMap((subject) => {
        const evidence: ConfigEvidence[] = [];
        for (const alternatives of rule.when) {
          const held = alternatives.flatMap(({ label, check }) =>
            this.find(check, subject, permissions, servers).map((found) => (label === undefined ? found : { label, ...found })),
          );
          if (held.length === 0) {
            return [];
          }
          evidence.push(...held);
        }
        return [
          {
            ruleId: rule.id,
            ruleVersion: rule.version,
            ruleSetDigest: this.ruleSet.digest,
            severity: rule.severity,
            explanation: rule.explanation,
            source: rule.source,
            subjectKind: rule.subject,
            subject,
            evidence,
            eventIds: [snapshot.id],
          },
        ];
      }),
    );
  }

  private find(check: ConfigCheck, subject: string, permissions: EffectivePermissions, servers: readonly McpServer[]): Found[] {
    switch (check.kind) {
      case "allows":
        // The first example the agent would run without asking is enough to show the rule holds.
        for (const example of check.targets) {
          const decision = permissions.decide(subject, check.permission, example);
          if (decision.action === "allow" && !(check.configured && decision.entry === EffectivePermissions.DEFAULT)) {
            return [{ value: example, entry: decision.entry }];
          }
        }
        return [];
      case "remote_mcp":
        return servers.flatMap((server) => {
          const decision = permissions.decide(subject, McpServers.toolKey(server.name), "*");
          return server.remote && decision.action === "allow" ? [{ value: server.url ?? server.name, entry: decision.entry }] : [];
        });
      case "match":
        return (servers.find((server) => server.name === subject)?.secretKeys ?? [])
          .filter((key) => check.pattern.test(key.name))
          .map((key) => ({ value: key.name, entry: key.entry }));
    }
  }
}
