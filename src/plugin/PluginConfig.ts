import { homedir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_STATE_DIR = process.env["LOCALAPPDATA"] ?? join(homedir(), ".local", "state");
const DEFAULT_GAP_STATE = join(DEFAULT_STATE_DIR, "tracevault", "pending-gaps.json");

export class PluginConfig {
  private readonly endpoint: string;
  private readonly gapPath: string;

  constructor(endpoint: string, statePath: string = DEFAULT_GAP_STATE) {
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
