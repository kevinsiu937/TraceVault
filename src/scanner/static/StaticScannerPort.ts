import type { ConfigFinding } from "../../schema/ConfigFinding.js";
import type { Event } from "../../schema/Event.js";

export type ConfigSnapshotEvent = Extract<Event, { type: "config.snapshot" }>;
export type McpToolsEvent = Extract<Event, { type: "mcp.tools" }>;

/** Checks one recorded configuration, and the latest tool list of each local MCP server, against the static rules. */
export interface StaticScannerPort {
  /** `firstSeen` holds each server's first recorded tool list, in any session; each tool is compared with it. */
  scan(snapshot: ConfigSnapshotEvent, toolLists?: readonly McpToolsEvent[], firstSeen?: readonly McpToolsEvent[]): ConfigFinding[];
}
