import { join } from "node:path";
import type { HardenCommand } from "./HardenCommand.js";
import { InstallManifest } from "./InstallManifest.js";

const MANIFEST_FILE = join(".opencode", ".tracevault-install.json");

export class UninstallCommand {
  private readonly projectDir: string;

  /** `hardener`, when given, also puts back the configuration harden changed. */
  constructor(projectDir: string, private readonly hardener: HardenCommand | null = null) {
    this.projectDir = projectDir;
  }

  uninstall(): string {
    const manifest = new InstallManifest(join(this.projectDir, MANIFEST_FILE));
    if (!manifest.applied()) {
      return "TraceVault is not installed";
    }
    manifest.undo();

    const removed = "removed TraceVault plugin and restored the agent configuration";
    return this.hardener?.hardened() ? `${removed}\n${this.hardener.undo()}` : removed;
  }
}
