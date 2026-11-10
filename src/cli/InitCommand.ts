import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentConfigFile } from "./AgentConfigFile.js";
import { InstallManifest } from "./InstallManifest.js";

const LOADER_FILE = join(".opencode", "plugin", "tracevault.js");
const MANIFEST_FILE = join(".opencode", ".tracevault-install.json");
const HOOK_URL = "http://127.0.0.1:4319/hook";

export class InitCommand {
  private readonly projectDir: string;
  private readonly block: boolean;

  /** `block` installs the opt-in guard, which refuses a call a blockable rule matches. Off by default. */
  constructor(projectDir: string, block = false) {
    this.projectDir = projectDir;
    this.block = block;
  }

  install(): string {
    const loaderPath = join(this.projectDir, LOADER_FILE);
    const manifestPath = join(this.projectDir, MANIFEST_FILE);
    const loader = new AgentConfigFile(loaderPath);
    const existed = loader.exists();
    const previousContent = existed ? loader.read() : null;

    new InstallManifest(loaderPath, existed, previousContent).save(manifestPath);
    loader.write(this.loaderSource());

    return `installed TraceVault plugin at ${LOADER_FILE.replaceAll("\\", "/")}${this.block ? " with blocking on" : ""}`;
  }

  private loaderSource(): string {
    const pluginDir = new URL("../plugin/", import.meta.url).href;
    const guardImport = this.block
      ? `import { GuardAssembly } from ${JSON.stringify(new URL("./GuardAssembly.js", import.meta.url).href)};\n`
      : "";
    const rulesDir = fileURLToPath(new URL("../../rules", import.meta.url));
    const guard = this.block ? `, undefined, new GuardAssembly().fromDirectory(${JSON.stringify(rulesDir)})` : "";

    return `import { EventForwarder } from ${JSON.stringify(`${pluginDir}EventForwarder.js`)};
import { PendingGapStore } from ${JSON.stringify(`${pluginDir}PendingGapStore.js`)};
import { PluginConfig } from ${JSON.stringify(`${pluginDir}PluginConfig.js`)};
import { TraceVaultPlugin } from ${JSON.stringify(`${pluginDir}TraceVaultPlugin.js`)};
${guardImport}
export const TraceVault = async () => {
  const config = new PluginConfig(${JSON.stringify(HOOK_URL)});
  return new TraceVaultPlugin(new EventForwarder(config), new PendingGapStore(config.gapStatePath)${guard}).hooks();
};
`;
  }
}
