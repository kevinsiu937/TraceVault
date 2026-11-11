import { createHash } from "node:crypto";

import { ConfigRedactor } from "./ConfigRedactor.js";
import type { McpToolRelay } from "./McpToolRelay.js";

export interface PreamblePayloads {
  readonly payloads: readonly unknown[];
  /** Call once every payload got through, so a failed send is retried. */
  delivered(): void;
}

/**
 * What this OpenCode process knows about itself, sent into each session before
 * that session's next payload: the configuration once, and each local MCP
 * server's tool list whenever the session has not seen it in that form.
 * OpenCode calls the config hook once, when it loads the plugin (read from the
 * 1.18.32 bundle), so a resumed session in a new process receives that
 * process's configuration.
 */
export class SessionPreamble {
  private payload: Record<string, unknown> | null = null;
  private relayGap: Record<string, unknown> | null = null;
  private readonly configured = new Set<string>();
  private readonly listed = new Map<string, Map<string, string>>();

  constructor(
    private readonly redactor: ConfigRedactor = new ConfigRedactor(),
    private readonly clock: () => Date = () => new Date(),
    private readonly relay: McpToolRelay | null = null,
  ) {}

  configure(config: unknown): void {
    try {
      this.payload = { hook: "config.snapshot", config: this.redactor.redact(config) };
    } catch (error) {
      this.payload = this.gap(`configuration could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
    }
    // After the snapshot, so it shows the commands as the configuration wrote them.
    const problem = this.relay?.route(config) ?? null;
    this.relayGap = problem === null ? null : this.gap(problem);
  }

  // shortcut: two sends racing before either is delivered both carry the preamble (seen once in the Phase 3 exit run), mark it in flight if the duplicate ever matters.
  for(sessionID: string): PreamblePayloads {
    const payloads: unknown[] = [];
    const first = this.payload !== null && !this.configured.has(sessionID);
    if (first) {
      payloads.push(...[this.payload, this.relayGap].flatMap((payload) => (payload === null ? [] : [{ ...payload, sessionID }])));
    }
    const seen = this.listed.get(sessionID) ?? new Map<string, string>();
    const fresh = (this.relay?.lists() ?? []).flatMap((list) => {
      const digest = createHash("sha256").update(JSON.stringify(list.tools)).digest("hex");
      return seen.get(list.server) === digest ? [] : [{ server: list.server, digest, tools: list.tools }];
    });
    payloads.push(...fresh.map(({ server, tools }) => ({ hook: "mcp.tools", sessionID, server, tools })));

    return {
      payloads,
      delivered: () => {
        if (first) {
          this.configured.add(sessionID);
        }
        for (const { server, digest } of fresh) {
          seen.set(server, digest);
        }
        this.listed.set(sessionID, seen);
      },
    };
  }

  private gap(reason: string): Record<string, unknown> {
    const at = this.clock().toISOString();
    return { hook: "capture.gap", from: at, to: at, reason };
  }
}
