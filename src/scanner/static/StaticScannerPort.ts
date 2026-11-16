import type { ConfigFinding } from "../../schema/ConfigFinding.js";
import type { Event } from "../../schema/Event.js";

export type ConfigSnapshotEvent = Extract<Event, { type: "config.snapshot" }>;
export type McpToolsEvent = Extract<Event, { type: "mcp.tools" }>;

/** The tool list a server's tools are compared with: its first, or the one the developer accepted, and when. */
export interface ToolBaseline {
  readonly list: McpToolsEvent;
  readonly acceptedAt?: string;
}

/** Checks one recorded configuration, and the latest tool list of each local MCP server, against the static rules. */
export interface StaticScannerPort {
  /** `baselines` holds one list per server, recorded in any session; each tool is compared with its server's. */
  scan(snapshot: ConfigSnapshotEvent, toolLists?: readonly McpToolsEvent[], baselines?: readonly ToolBaseline[]): ConfigFinding[];
}
