import { homedir } from "node:os";
import { dirname, join } from "node:path";

export class PluginConfig {
  /** Where TraceVault keeps what must outlive a project folder: the gap state and, by default, the database. */
  static stateDirectory(): string {
    return join(process.env["LOCALAPPDATA"] ?? join(homedir(), ".local", "state"), "tracevault");
  }

  private readonly endpoint: string;
  private readonly gapPath: string;

  constructor(endpoint: string, statePath: string = join(PluginConfig.stateDirectory(), "pending-gaps.json")) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new TypeError(`unsupported endpoint protocol: ${parsed.protocol}`);
    }
    this.endpoint = parsed.toString();
    this.gapPath = statePath;
  }

  get hookUrl(): string {
    return this.endpoint;
  }

  get gapStatePath(): string {
    return this.gapPath;
  }

  /** Where the MCP relay hands off tool lists, beside the gap state. */
  get mcpToolsDirectory(): string {
    return join(dirname(this.gapPath), "mcp-tools");
  }
}
