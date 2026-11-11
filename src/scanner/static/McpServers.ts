type Block = Readonly<Record<string, unknown>>;

export interface McpServer {
  readonly name: string;
  readonly remote: boolean;
  readonly url: string | null;
  /** The names under the server's environment and headers, each with its JSON pointer. Their values are never stored. */
  readonly secretKeys: readonly { readonly name: string; readonly entry: string }[];
}

/** The enabled MCP servers of a recorded configuration. A disabled server never starts, so it holds nothing. */
export class McpServers {
  static of(config: Block): McpServer[] {
    return Object.entries(McpServers.block(config["mcp"])).flatMap(([name, value]) => {
      const server = McpServers.block(value);
      if (server["enabled"] === false) {
        return [];
      }
      const secretKeys = (["environment", "headers"] as const).flatMap((map) =>
        Object.keys(McpServers.block(server[map])).map((key) => ({ name: key, entry: `/mcp/${McpServers.escape(name)}/${map}/${McpServers.escape(key)}` })),
      );
      return [{ name, remote: server["type"] === "remote", url: typeof server["url"] === "string" ? server["url"] : null, secretKeys }];
    });
  }

  /** OpenCode names a server's tools `<server>_<tool>`, with every character outside [a-zA-Z0-9_-] turned into "_". */
  static toolKey(server: string): string {
    return `${server.replace(/[^a-zA-Z0-9_-]/g, "_")}_*`;
  }

  private static block(value: unknown): Block {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Block) : {};
  }

  private static escape(token: string): string {
    return token.replaceAll("~", "~0").replaceAll("/", "~1");
  }
}
