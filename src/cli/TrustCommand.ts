import { existsSync } from "node:fs";
import { SqliteEventStore } from "../store/SqliteEventStore.js";
import { SqliteMcpTrustStore } from "../store/SqliteMcpTrustStore.js";
import type { CliCommand } from "./CliCommand.js";
import { CommandOptions } from "./CommandOptions.js";

/**
 * `tracevault trust <server>`: accepts the tool list a local MCP server last
 * sent, so later sessions compare its tools with that list instead of the
 * first one. It adds a row and changes no event. It never creates a database.
 */
export class TrustCommand implements CliCommand {
  readonly name = "trust";
  readonly usageOnError = false;
  readonly usage = `  tracevault trust <server> [--db <path>]   accept an MCP server's current tools after a deliberate change`;

  constructor(
    private readonly defaultDbPath: string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async run(args: readonly string[]): Promise<number> {
    const server = args[0];
    if (server === undefined || server.startsWith("-")) {
      throw new TypeError("trust expects an MCP server name");
    }
    const dbPath = CommandOptions.parse(args.slice(1), { "--db": "file" })["--db"] ?? this.defaultDbPath;
    if (!existsSync(dbPath)) {
      throw new Error(`no database at ${dbPath}`);
    }
    const store = new SqliteEventStore(dbPath);
    try {
      const lists = store.listMatching({ sessionId: null, kinds: ["mcp.tools"], outcomes: [], operations: [], text: "" });
      const latest = lists
        .filter((event) => event.type === "mcp.tools" && event.data.server === server)
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id))
        .pop();
      if (latest?.type !== "mcp.tools") {
        throw new Error(`no MCP server '${server}' has listed tools in ${dbPath}; nothing to accept`);
      }
      const acceptedAt = this.clock().toISOString();
      new SqliteMcpTrustStore(dbPath).accept({ server, eventId: latest.id, digest: latest.data.digest, acceptedAt });
      process.stdout.write(`accepted ${server}'s ${latest.data.tools.length} ${latest.data.tools.length === 1 ? "tool" : "tools"} as listed ${latest.timestamp} (${latest.id}); later sessions compare with this list\n`);
      return 0;
    } finally {
      store.close();
    }
  }
}
