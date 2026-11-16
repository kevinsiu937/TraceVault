import type { ConfigFinding } from "../schema/ConfigFinding.js";
import type { Event } from "../schema/Event.js";
import type { ConfigSnapshotEvent, McpToolsEvent, StaticScannerPort, ToolBaseline } from "../scanner/static/StaticScannerPort.js";
import type { McpAcceptance } from "../store/McpTrustPort.js";
import type { ConfigurationSnapshot } from "./ConfigurationSnapshot.js";

const NO_RULES: StaticScannerPort = { scan: () => [] };

/** The latest configuration a session recorded, and the static findings on it. */
export class SessionConfiguration {
  constructor(private readonly scanner: StaticScannerPort = NO_RULES) {}

  /** `acceptances` are every acceptance in the database; those of the session's servers are listed, whenever made. */
  latest(session: readonly Event[], acceptances: readonly McpAcceptance[] = []): ConfigurationSnapshot | null {
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
    return {
      eventId: event.id,
      recordedAt: event.timestamp,
      digest: event.data.digest,
      config: event.data.config,
      mcpTools: [...lists.values()],
      acceptances: acceptances.filter((acceptance) => lists.has(acceptance.server)).map(({ server, acceptedAt }) => ({ server, acceptedAt })),
    };
  }

  /**
   * `known` holds tool lists recorded in any session, so each tool can be compared with its server's first list,
   * or with the list accepted last before this session's configuration was recorded.
   */
  findings(session: readonly Event[], known: readonly McpToolsEvent[] = [], acceptances: readonly McpAcceptance[] = []): ConfigFinding[] {
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
    const all = [...known, ...lists.values()];
    return this.scanner.scan(event, [...lists.values()], this.baselines(all, acceptances.filter((acceptance) => acceptance.acceptedAt < event.timestamp)));
  }

  /** Each server's latest acceptance that still points at the list it accepted, else its first list. */
  private baselines(lists: readonly McpToolsEvent[], acceptances: readonly McpAcceptance[]): ToolBaseline[] {
    const byId = new Map(lists.map((list) => [list.id, list]));
    return this.firstSeen(lists).map((first) => {
      const accepted = acceptances
        .filter((acceptance) => acceptance.server === first.data.server && byId.get(acceptance.eventId)?.data.digest === acceptance.digest)
        .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt))
        .pop();
      const list = accepted === undefined ? undefined : byId.get(accepted.eventId);
      return accepted === undefined || list === undefined ? { list: first } : { list, acceptedAt: accepted.acceptedAt };
    });
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
