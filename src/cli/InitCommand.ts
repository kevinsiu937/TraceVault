import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HardenCommand } from "./HardenCommand.js";
import { InstallManifest } from "./InstallManifest.js";

const LOADER_FILE = join(".opencode", "plugin", "tracevault.js");
const MANIFEST_FILE = join(".opencode", ".tracevault-install.json");
const DEFAULT_PORT = 4319;

export class InitCommand {
  private readonly projectDir: string;
  private readonly block: boolean;
  private readonly hardener: HardenCommand | null;

  /**
   * `block` installs the opt-in guard, which refuses a call a blockable rule matches. Off by default.
   * `hardener`, when given, also tightens the project's configuration after the install.
   */
  constructor(
    projectDir: string,
    block = false,
    hardener: HardenCommand | null = null,
    /** The port the service listens on; the plugin posts there. */
    private readonly port: number = DEFAULT_PORT,
  ) {
    this.projectDir = projectDir;
    this.block = block;
    this.hardener = hardener;
  }

  install(): string {
    new InstallManifest(join(this.projectDir, MANIFEST_FILE)).apply(join(this.projectDir, LOADER_FILE), this.loaderSource());

    const installed = `installed TraceVault plugin at ${LOADER_FILE.replaceAll("\\", "/")}${this.block ? " with blocking on" : ""}`;
    const lines = [
      installed,
      ...(this.port === DEFAULT_PORT ? [] : [`the plugin posts to port ${this.port}; start the service with: tracevault run --port ${this.port}`]),
      ...(this.hardener === null ? [] : [this.harden(this.hardener)]),
    ];
    return lines.join("\n");
  }

  /** A configuration harden refuses to touch must not undo the install: recording still works without it. */
  private harden(hardener: HardenCommand): string {
    try {
      return hardener.harden();
    } catch (error) {
      return `not hardened: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  private loaderSource(): string {
    const pluginDir = new URL("../plugin/", import.meta.url).href;
    const guardImport = this.block
      ? `import { GuardAssembly } from ${JSON.stringify(new URL("./GuardAssembly.js", import.meta.url).href)};\n`
      : "";
    const rulesDir = fileURLToPath(new URL("../../rules", import.meta.url));
    const guard = this.block ? `new GuardAssembly().fromDirectory(${JSON.stringify(rulesDir)})` : "null";
    // OpenCode runs on Bun, so the relay runs on the Node.js that runs this install.
    const relayEntry = fileURLToPath(new URL("./mcp-relay.js", import.meta.url));

    return `import { EventForwarder } from ${JSON.stringify(`${pluginDir}EventForwarder.js`)};
import { PendingGapStore } from ${JSON.stringify(`${pluginDir}PendingGapStore.js`)};
import { PluginConfig } from ${JSON.stringify(`${pluginDir}PluginConfig.js`)};
import { TraceVaultPlugin } from ${JSON.stringify(`${pluginDir}TraceVaultPlugin.js`)};
import { SessionPreamble } from ${JSON.stringify(`${pluginDir}SessionPreamble.js`)};
import { McpToolRelay } from ${JSON.stringify(`${pluginDir}McpToolRelay.js`)};
${guardImport}
export const TraceVault = async () => {
  const config = new PluginConfig(${JSON.stringify(`http://127.0.0.1:${this.port}/hook`)});
  const relay = new McpToolRelay(${JSON.stringify(process.execPath)}, ${JSON.stringify(relayEntry)}, config.mcpToolsDirectory);
  return new TraceVaultPlugin(new EventForwarder(config), new PendingGapStore(config.gapStatePath), undefined, ${guard}, undefined, new SessionPreamble(undefined, undefined, relay)).hooks();
};
`;
  }
}
