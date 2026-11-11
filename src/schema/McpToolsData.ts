/**
 * The tools one local MCP server listed, as the relay saw them pass, with a
 * digest that tells two lists apart. Each tool is kept as the server sent it.
 */
export interface McpToolsData {
  readonly server: string;
  readonly digest: string;
  readonly tools: readonly Readonly<Record<string, unknown>>[];
}
