import type { ConfigFinding } from "../schema/ConfigFinding.js";
import type { Event } from "../schema/Event.js";
import type { ConfigSnapshotEvent, StaticScannerPort } from "../scanner/static/StaticScannerPort.js";
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

  findings(session: readonly Event[]): ConfigFinding[] {
    const event = this.snapshot(session);
    return event === null ? [] : this.scanner.scan(event);
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
