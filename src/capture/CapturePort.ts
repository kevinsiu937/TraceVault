import type { Event } from "../schema/Event.js";

export interface CapturePort {
  /** `mcpServers` names the MCP servers a session's configuration holds, to tell a server name from a tool name. */
  toEvent(raw: unknown, receivedAt: Date, mcpServers?: (sessionId: string) => readonly string[]): Event | null;
}
