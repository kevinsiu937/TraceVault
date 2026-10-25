import { join } from "node:path";
import { AgentConfigFile } from "./AgentConfigFile.js";
import { InstallManifest } from "./InstallManifest.js";

const LOADER_FILE = join(".opencode", "plugin", "tracevault.js");
const MANIFEST_FILE = join(".opencode", ".tracevault-install.json");
const HOOK_URL = "http://127.0.0.1:4319/hook";

export class InitCommand {
  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  install(): string {
    const loaderPath = join(this.projectDir, LOADER_FILE);
    const manifestPath = join(this.projectDir, MANIFEST_FILE);
    const loader = new AgentConfigFile(loaderPath);
    const existed = loader.exists();
    const previousContent = existed ? loader.read() : null;

    new InstallManifest(loaderPath, existed, previousContent).save(manifestPath);
    loader.write(this.loaderSource());

    return `installed TraceVault plugin at ${LOADER_FILE.replaceAll("\\", "/")}`;
  }

  private loaderSource(): string {
    const pluginDir = new URL("../plugin/", import.meta.url).href;

    return `import { EventForwarder } from ${JSON.stringify(`${pluginDir}EventForwarder.js`)};
import { PluginConfig } from ${JSON.stringify(`${pluginDir}PluginConfig.js`)};
import { TraceVaultPlugin } from ${JSON.stringify(`${pluginDir}TraceVaultPlugin.js`)};

export const TraceVault = async () => {
  const config = new PluginConfig(${JSON.stringify(HOOK_URL)});
  return new TraceVaultPlugin(new EventForwarder(config)).hooks();
};
`;
  }
}
