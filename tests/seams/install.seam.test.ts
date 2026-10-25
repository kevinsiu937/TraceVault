import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { InitCommand } from "../../src/cli/InitCommand.js";
import { UninstallCommand } from "../../src/cli/UninstallCommand.js";
import { main } from "../../src/cli/index.js";

const LOADER = ".opencode/plugin/tracevault.js";
const MANIFEST = ".opencode/.tracevault-install.json";

function snapshot(root: string): Record<string, string> {
  const files: Record<string, string> = {};

  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolutePath, relativePath);
      } else {
        files[relativePath] = readFileSync(absolutePath).toString("base64");
      }
    }
  };

  if (existsSync(root)) {
    walk(root, "");
  }

  return files;
}

describe("seam B: install writes the plugin, uninstall restores the project", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), "tracevault-install-"));
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it("installs the plugin loader and records what it wrote", () => {
    const summary = new InitCommand(projectDir).install();

    expect(summary).toMatch(/install/i);
    expect(existsSync(join(projectDir, LOADER))).toBe(true);

    const loader = readFileSync(join(projectDir, LOADER), "utf8");
    expect(loader).toContain("export const TraceVault = async () =>");
    expect(loader).toContain("TraceVaultPlugin");
    expect(loader).toContain("EventForwarder");
    expect(loader).toContain("PluginConfig");

    const manifest = JSON.parse(readFileSync(join(projectDir, MANIFEST), "utf8")) as {
      targetFile: string;
      existed: boolean;
      previousContent: string | null;
    };
    expect(manifest.targetFile.replaceAll("\\", "/")).toContain(LOADER);
    expect(manifest.existed).toBe(false);
    expect(manifest.previousContent).toBeNull();
  });

  it("restores the project directory byte-for-byte on uninstall", () => {
    const before = snapshot(projectDir);

    new InitCommand(projectDir).install();
    new UninstallCommand(projectDir).uninstall();

    expect(snapshot(projectDir)).toEqual(before);
  });

  it("restores the exact bytes of a plugin loader that existed before install", () => {
    const loaderPath = join(projectDir, LOADER);
    const original = "export const Custom = async () => ({});\n// user-owned loader\n";
    mkdirSync(join(projectDir, ".opencode", "plugin"), { recursive: true });
    writeFileSync(loaderPath, original, "utf8");
    const before = snapshot(projectDir);

    new InitCommand(projectDir).install();
    expect(readFileSync(loaderPath, "utf8")).not.toBe(original);

    new UninstallCommand(projectDir).uninstall();

    expect(readFileSync(loaderPath, "utf8")).toBe(original);
    expect(snapshot(projectDir)).toEqual(before);
  });

  it("installs and uninstalls repeatedly without residue", () => {
    const before = snapshot(projectDir);
    const init = new InitCommand(projectDir);
    const uninstall = new UninstallCommand(projectDir);

    init.install();
    uninstall.uninstall();
    init.install();
    uninstall.uninstall();
    uninstall.uninstall();

    expect(snapshot(projectDir)).toEqual(before);
  });

  it("runs init and uninstall through the CLI with --dir", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    try {
      await expect(main(["init", "--dir", projectDir])).resolves.toBe(0);
      expect(existsSync(join(projectDir, LOADER))).toBe(true);

      await expect(main(["uninstall", "--dir", projectDir])).resolves.toBe(0);
      expect(existsSync(join(projectDir, LOADER))).toBe(false);
      expect(stdout).toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
    }
  });
});
