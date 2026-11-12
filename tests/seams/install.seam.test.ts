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

  it("routes local MCP servers through the relay, on the Node.js that ran the install", () => {
    new InitCommand(projectDir).install();
    const loader = readFileSync(join(projectDir, LOADER), "utf8");

    expect(loader).toContain(`new McpToolRelay(${JSON.stringify(process.execPath)}, `);
    expect(loader).toContain(JSON.stringify(join(import.meta.dirname, "../../src/cli/mcp-relay.js")));
    expect(loader).toContain("new SessionPreamble(undefined, undefined, relay)");
  });

  it("installs the guard only when init is given --block", () => {
    new InitCommand(projectDir).install();
    const plain = readFileSync(join(projectDir, LOADER), "utf8");
    new UninstallCommand(projectDir).uninstall();
    new InitCommand(projectDir, true).install();
    const blocking = readFileSync(join(projectDir, LOADER), "utf8");

    expect(plain).not.toContain("GuardAssembly");
    expect(blocking).toContain("new GuardAssembly().fromDirectory(");
    expect(blocking).toContain(JSON.stringify(join(import.meta.dirname, "../../rules")));
  });

  it("restores the project byte-for-byte after an install with blocking on", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const before = snapshot(projectDir);

    try {
      await expect(main(["init", "--block", "--dir", projectDir])).resolves.toBe(0);
      expect(readFileSync(join(projectDir, LOADER), "utf8")).toContain("GuardAssembly");
      await expect(main(["uninstall", "--dir", projectDir])).resolves.toBe(0);
    } finally {
      stdout.mockRestore();
    }

    expect(snapshot(projectDir)).toEqual(before);
  });

  it("refuses --block on uninstall", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      await expect(main(["uninstall", "--block", "--dir", projectDir])).resolves.toBe(1);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining("unknown option '--block'"));
    } finally {
      stderr.mockRestore();
    }
  });

  it.each([
    [["run", "--port", "70000"], "--port expects an integer between 0 and 65535, got '70000'"],
    [["run", "--db"], "--db expects a file path"],
    [["import", "--port", "4319"], "unknown option '--port'"],
    [["init", "--dir"], "--dir expects a directory path"],
  ])("refuses %j before touching anything", async (argv, message) => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    try {
      await expect(main(argv)).resolves.toBe(1);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining(message));
    } finally {
      stderr.mockRestore();
    }
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
