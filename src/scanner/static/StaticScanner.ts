import type { ConfigEvidence, ConfigFinding } from "../../schema/ConfigFinding.js";
import type { ConfigCheck, ConfigRule, MatchFact } from "./ConfigRule.js";
import { EffectivePermissions } from "./EffectivePermissions.js";
import { type McpServer, McpServers } from "./McpServers.js";
import type { ConfigSnapshotEvent, McpToolsEvent, StaticScannerPort } from "./StaticScannerPort.js";
import { ToolTexts } from "./ToolTexts.js";

export interface ConfigRuleSet {
  readonly rules: readonly ConfigRule[];
  /** Covers every rule file read, so a rule edit shows on every finding. */
  readonly digest: string;
}

type Found = Omit<ConfigEvidence, "label">;

/** One thing a rule may be about, the event it was recorded in, and its matchable facts. */
interface Subject {
  readonly name: string;
  readonly eventId: string;
  readonly facts: Readonly<Partial<Record<MatchFact, readonly Found[]>>>;
  /** For a tool: its server and the tool as the server listed it. */
  readonly tool?: { readonly server: string; readonly listed: Readonly<Record<string, unknown>> };
}

// Shown by code point, because the point of these characters is that nobody sees them.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u{E0000}-\u{E007F}]/gu;

export class StaticScanner implements StaticScannerPort {
  constructor(private readonly ruleSet: ConfigRuleSet) {}

  scan(snapshot: ConfigSnapshotEvent, toolLists: readonly McpToolsEvent[] = [], firstSeen: readonly McpToolsEvent[] = []): ConfigFinding[] {
    const first = new Map(firstSeen.map((list) => [list.data.server, list]));
    const permissions = EffectivePermissions.of(snapshot.data.config);
    const servers = McpServers.of(snapshot.data.config);
    const subjects: Record<ConfigRule["subject"], Subject[]> = {
      agent: permissions.agents().map((name) => ({ name, eventId: snapshot.id, facts: {} })),
      "mcp-server": servers.map((server) => ({
        name: server.name,
        eventId: snapshot.id,
        facts: { secret_keys: server.secretKeys.map((key) => ({ value: key.name, entry: key.entry })) },
      })),
      tool: toolLists.flatMap((list) =>
        list.data.tools.map((tool) => ({
          name: `${list.data.server}/${String(tool["name"])}`,
          eventId: list.id,
          facts: { text: ToolTexts.of(tool) },
          tool: { server: list.data.server, listed: tool },
        })),
      ),
    };

    return this.ruleSet.rules.flatMap((rule) =>
      subjects[rule.subject].flatMap(({ name: subject, eventId, facts, tool }) => {
        const evidence: ConfigEvidence[] = [];
        for (const alternatives of rule.when) {
          const held = alternatives.flatMap(({ label, check }) =>
            (check.kind === "changed_since_first_seen" ? this.changed(tool, first) : this.find(check, subject, facts, permissions, servers)).map((found) => (label === undefined ? found : { label, ...found })),
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
            title: rule.title,
            explanation: rule.explanation,
            recommendation: rule.recommendation,
            source: rule.source,
            subjectKind: rule.subject,
            subject,
            evidence,
            eventIds: [eventId],
          },
        ];
      }),
    );
  }

  /** Tag characters spell ASCII one for one, so a hidden sentence is shown as the sentence; other invisible characters by code point. */
  private visible(text: string): string {
    return text
      .replace(/[\u{E0020}-\u{E007E}]+/gu, (run) => `[hidden text: ${[...run].map((character) => String.fromCodePoint((character.codePointAt(0) ?? 0xe0020) - 0xe0000)).join("")}]`)
      .replace(INVISIBLE, (character) => `<U+${character.codePointAt(0)?.toString(16).toUpperCase()}>`);
  }

  /** How a tool differs from its server's first recorded list; nothing when no list was recorded before. */
  private changed(tool: Subject["tool"], first: ReadonlyMap<string, McpToolsEvent>): Found[] {
    const baseline = tool === undefined ? undefined : first.get(tool.server);
    if (tool === undefined || baseline === undefined) {
      return [];
    }
    const since = `since ${tool.server} was first seen, ${baseline.timestamp}`;
    const before = baseline.data.tools.find((candidate) => candidate["name"] === tool.listed["name"]);
    if (before === undefined) {
      return [{ value: `a tool its first list did not have, ${since}`, entry: "/name" }];
    }
    return (["description", "inputSchema"] as const)
      .filter((key) => this.stable(before[key]) !== this.stable(tool.listed[key]))
      .map((key) => ({ value: `${key === "description" ? "description" : "input schema"} changed ${since}`, entry: `/${key}` }));
  }

  /** JSON with object keys sorted, so a server that only reorders keys has not changed anything. */
  private stable(value: unknown): string {
    return JSON.stringify(value, (_, inner: unknown) =>
      inner !== null && typeof inner === "object" && !Array.isArray(inner)
        ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
        : inner,
    ) ?? "undefined";
  }

  private find(check: Exclude<ConfigCheck, { kind: "changed_since_first_seen" }>, subject: string, facts: Subject["facts"], permissions: EffectivePermissions, servers: readonly McpServer[]): Found[] {
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
        return (facts[check.fact] ?? []).flatMap((item) => {
          const found = check.pattern.exec(item.value)?.[0];
          if (found === undefined) {
            return [];
          }
          // A name is shown whole; from a long text, only the part that matched.
          const value = check.fact === "secret_keys" ? item.value : found;
          return [{ value: this.visible(value), entry: item.entry }];
        });
    }
  }
}
