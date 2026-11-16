/** The developer accepted one MCP server's tool list: the `mcp.tools` event, the digest it carried, and when. */
export interface McpAcceptance {
  readonly server: string;
  readonly eventId: string;
  readonly digest: string;
  readonly acceptedAt: string;
}

/** Every acceptance ever made. Rows are only added, so an earlier acceptance stays visible. */
export interface McpTrustPort {
  accept(acceptance: McpAcceptance): void;
  /** In the order they were made. */
  list(): McpAcceptance[];
}
