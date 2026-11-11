import type { ConfigFinding } from "../../schema/ConfigFinding.js";
import type { Event } from "../../schema/Event.js";

export type ConfigSnapshotEvent = Extract<Event, { type: "config.snapshot" }>;
export type McpToolsEvent = Extract<Event, { type: "mcp.tools" }>;

/** Checks one recorded configuration, and the latest tool list of each local MCP server, against the static rules. */
export interface StaticScannerPort {
  scan(snapshot: ConfigSnapshotEvent, toolLists?: readonly McpToolsEvent[]): ConfigFinding[];
}
