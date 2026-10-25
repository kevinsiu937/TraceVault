import { join } from "node:path";
import { AgentConfigFile } from "./AgentConfigFile.js";
import { InstallManifest } from "./InstallManifest.js";

const MANIFEST_FILE = join(".opencode", ".tracevault-install.json");

export class UninstallCommand {
  private readonly projectDir: string;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
  }

  uninstall(): string {
    const manifestPath = join(this.projectDir, MANIFEST_FILE);
    const manifestFile = new AgentConfigFile(manifestPath);

    if (!manifestFile.exists()) {
      return "TraceVault is not installed";
    }

    const manifest = new InstallManifest();
    manifest.load(manifestPath);

    const target = new AgentConfigFile(manifest.target);
    if (manifest.existed) {
      const previousContent = manifest.previousContent;
      if (previousContent === null) {
        throw new TypeError(`install manifest is missing the previous content: ${manifestPath}`);
      }
      target.write(previousContent);
    } else {
      target.delete();
    }

    manifest.delete(manifestPath);

    return "removed TraceVault plugin and restored the agent configuration";
  }
}
