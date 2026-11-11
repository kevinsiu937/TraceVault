import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface McpToolList {
  readonly server: string;
  readonly tools: readonly Readonly<Record<string, unknown>>[];
}

/**
 * Routes the enabled local MCP servers of this OpenCode process through the
 * relay, and reads back the tool lists the relay hands off. A plugin cannot
 * see MCP tool descriptions any other way (probed 11 Nov 2026).
 */
export class McpToolRelay {
  private readonly files = new Map<string, string>();

  constructor(
    /** The Node.js that ran `tracevault init`; OpenCode itself runs on Bun. */
    private readonly runtime: string,
    private readonly entry: string,
    private readonly directory: string,
    private readonly pid: number = process.pid,
  ) {}

  /** Rewrites each enabled local server's command, in place; returns why it could not, or null. */
  route(config: unknown): string | null {
    if (!existsSync(this.runtime)) {
      return `MCP tool descriptions not recorded: the relay runtime ${this.runtime} is missing`;
    }
    const servers = this.block(this.block(config)["mcp"]);
    for (const [name, value] of Object.entries(servers)) {
      const server = this.block(value);
      const command = server["command"];
      if (server["type"] !== "local" || server["enabled"] === false || !Array.isArray(command) || !command.every((part) => typeof part === "string")) {
        continue;
      }
      const file = join(this.directory, `${this.pid}-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
      // A file left by an earlier process with the same pid must not pass for this one's.
      rmSync(file, { force: true });
      mkdirSync(this.directory, { recursive: true });
      server["command"] = [this.runtime, this.entry, file, "--", ...command];
      this.files.set(name, file);
    }
    return null;
  }

  /** The latest tool list of each routed server that has listed its tools. */
  lists(): McpToolList[] {
    return [...this.files].flatMap(([server, file]) => {
      try {
        const tools: unknown = JSON.parse(readFileSync(file, "utf8")).tools;
        return Array.isArray(tools) ? [{ server, tools: tools.filter((tool) => tool !== null && typeof tool === "object") }] : [];
      } catch {
        return [];
      }
    });
  }

  private block(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  }
}
