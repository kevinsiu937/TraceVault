import type { ConfigFinding } from "../schema/ConfigFinding.js";
import type { Event } from "../schema/Event.js";
import type { ConfigSnapshotEvent, McpToolsEvent, StaticScannerPort } from "../scanner/static/StaticScannerPort.js";
import type { ConfigurationSnapshot } from "./ConfigurationSnapshot.js";

const NO_RULES: StaticScannerPort = { scan: () => [] };

/** The latest configuration a session recorded, and the static findings on it. */
export class SessionConfiguration {
  constructor(private readonly scanner: StaticScannerPort = NO_RULES) {}

  latest(session: readonly Event[]): ConfigurationSnapshot | null {
    const event = this.snapshot(session);
    if (event === null) {
      return null;
    }
    const lists = new Map<string, ConfigurationSnapshot["mcpTools"][number]>();
    for (const candidate of session) {
      if (candidate.type === "mcp.tools") {
        lists.set(candidate.data.server, { eventId: candidate.id, server: candidate.data.server, tools: candidate.data.tools });
      }
    }
    return { eventId: event.id, recordedAt: event.timestamp, digest: event.data.digest, config: event.data.config, mcpTools: [...lists.values()] };
  }

  /** `known` holds tool lists recorded in any session, so each tool can be compared with its server's first list. */
  findings(session: readonly Event[], known: readonly McpToolsEvent[] = []): ConfigFinding[] {
    const event = this.snapshot(session);
    if (event === null) {
      return [];
    }
    const lists = new Map<string, McpToolsEvent>();
    for (const candidate of session) {
      if (candidate.type === "mcp.tools") {
        lists.set(candidate.data.server, candidate);
      }
    }
    return this.scanner.scan(event, [...lists.values()], this.firstSeen([...known, ...lists.values()]));
  }

  /** Each server's first recorded tool list. A first sighting compares equal to itself, so it is trusted. */
  private firstSeen(lists: readonly McpToolsEvent[]): McpToolsEvent[] {
    const first = new Map<string, McpToolsEvent>();
    for (const list of [...lists].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))) {
      if (!first.has(list.data.server)) {
        first.set(list.data.server, list);
      }
    }
    return [...first.values()];
  }

  private snapshot(session: readonly Event[]): ConfigSnapshotEvent | null {
    let latest: ConfigSnapshotEvent | null = null;
    for (const event of session) {
      if (event.type === "config.snapshot") {
        latest = event;
      }
    }
    return latest;
  }
}
