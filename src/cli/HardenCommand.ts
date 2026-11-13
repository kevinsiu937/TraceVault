import { existsSync, readdirSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ConfigHardener } from "../scanner/static/ConfigHardener.js";
import { ConfigRuleLoader } from "../scanner/static/ConfigRuleLoader.js";
import { StaticScanner } from "../scanner/static/StaticScanner.js";
import { EventFactory } from "../schema/EventFactory.js";
import { AgentConfigFile } from "./AgentConfigFile.js";
import { InstallManifest } from "./InstallManifest.js";

const CONFIG_FILE = "opencode.json";
const MANIFEST_FILE = join(".opencode", ".tracevault-harden.json");
const SCHEMA = "https://opencode.ai/config.json";

/**
 * Tightens the project's own opencode.json so OpenCode asks before risky
 * calls, then re-checks the result with the static rules and reports what is
 * still risky. The first run saves the original bytes; `undo` puts them back.
 */
export class HardenCommand {
  constructor(
    private readonly projectDir: string,
    private readonly rulesDir: string = fileURLToPath(new URL("../../rules/config", import.meta.url)),
  ) {}

  harden(): string {
    if (existsSync(join(this.projectDir, "opencode.jsonc"))) {
      throw new Error("this project uses opencode.jsonc, which may hold comments; harden leaves it unchanged, so tighten it by hand");
    }
    const file = new AgentConfigFile(join(this.projectDir, CONFIG_FILE));
    const existed = file.exists();
    const text = existed ? file.read() : null;
    const current = text === null ? { $schema: SCHEMA } : HardenCommand.parse(text);
    const scanner = new StaticScanner(new ConfigRuleLoader().loadDirectory(this.rulesDir));
    const { config, changes } = new ConfigHardener().harden(current);

    const manifestPath = join(this.projectDir, MANIFEST_FILE);
    if (!existsSync(manifestPath)) {
      new InstallManifest(join(this.projectDir, CONFIG_FILE), existed, text).save(manifestPath);
    }
    file.write(`${JSON.stringify(config, null, 2)}\n`);

    const snapshot = new EventFactory().configSnapshot({ sessionId: "harden", correlationId: null, receivedAt: new Date(0) }, { digest: "sha256:harden", config });
    if (snapshot.type !== "config.snapshot") {
      throw new TypeError("not a snapshot");
    }
    const remaining = scanner.scan(snapshot).map((finding) => {
      const entries = [...new Set(finding.evidence.map((item) => item.entry))].join(", ");
      return `  - ${finding.title}: ${finding.subjectKind} ${finding.subject} (${entries})`;
    });
    return [
      `hardened ${CONFIG_FILE}`,
      ...(changes.length === 0 ? ["nothing needed changing in the top-level permission block"] : ["changed:", ...changes.map((change) => `  ${change}`)]),
      `original saved in ${MANIFEST_FILE.replaceAll("\\", "/")}; undo with: tracevault harden --undo`,
      ...(remaining.length === 0
        ? ["the static rules find nothing risky in the hardened file"]
        : ["still risky, set outside the top-level permission block; change these by hand:", ...remaining]),
    ].join("\n");
  }

  undo(): string {
    const manifestPath = join(this.projectDir, MANIFEST_FILE);
    if (!existsSync(manifestPath)) {
      throw new Error(`nothing to undo: no ${MANIFEST_FILE.replaceAll("\\", "/")} in ${this.projectDir}`);
    }
    const manifest = new InstallManifest();
    manifest.load(manifestPath);
    const file = new AgentConfigFile(manifest.target);
    if (manifest.existed && manifest.previousContent !== null) {
      file.write(manifest.previousContent);
    } else {
      file.delete();
    }
    manifest.delete(manifestPath);
    // shortcut: an empty .opencode folder is removed even if it existed empty before; track the folder in the manifest if that matters.
    const folder = dirname(manifestPath);
    if (existsSync(folder) && readdirSync(folder).length === 0) {
      rmdirSync(folder);
    }
    return manifest.existed ? `restored the original ${CONFIG_FILE}` : `removed the ${CONFIG_FILE} harden created`;
  }

  private static parse(text: string): Record<string, unknown> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`${CONFIG_FILE} is not plain JSON (comments?); harden leaves it unchanged, so tighten it by hand`);
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`${CONFIG_FILE} does not hold a JSON object; harden leaves it unchanged`);
    }
    return parsed as Record<string, unknown>;
  }
}
