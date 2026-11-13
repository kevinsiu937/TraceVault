import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { main } from "../../src/cli/index.js";
import { ConfigRuleLoader } from "../../src/scanner/static/ConfigRuleLoader.js";
import { EffectivePermissions } from "../../src/scanner/static/EffectivePermissions.js";
import { StaticScanner } from "../../src/scanner/static/StaticScanner.js";
import { EventFactory } from "../../src/schema/EventFactory.js";

const RULES = join(import.meta.dirname, "../../rules/config");

/** Every static finding the real rules raise on a configuration, as "rule subject". */
function findings(config: Record<string, unknown>): string[] {
  const event = new EventFactory().configSnapshot({ sessionId: "ses_harden", correlationId: null, receivedAt: new Date(0) }, { digest: "sha256:test", config });
  if (event.type !== "config.snapshot") {
    throw new TypeError("not a snapshot");
  }
  return new StaticScanner(new ConfigRuleLoader().loadDirectory(RULES)).scan(event).map((finding) => `${finding.ruleId} ${finding.subject}`);
}

const PERMISSIVE = {
  $schema: "https://opencode.ai/config.json",
  permission: {
    bash: { "*": "allow", "git *": "allow", "rm -rf /": "deny" },
    edit: "allow",
    webfetch: "allow",
    read: { "*": "allow", "*.env": "allow" },
    doom_loop: "allow",
    external_directory: "allow",
    // Last on purpose: OpenCode lets the last matching rule decide, so hardened keys must end up after it.
    "*": "allow",
  },
  mcp: { docs: { type: "local", command: ["node", "docs.js"] } },
};

describe("seam B: tracevault harden tightens the project's own configuration", () => {
  let directory: string;
  let config: string;
  let output: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-harden-"));
    config = join(directory, "opencode.json");
    output = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      output += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  function written(): Record<string, unknown> {
    return JSON.parse(readFileSync(config, "utf8")) as Record<string, unknown>;
  }

  it("turns a permissive configuration into one the static rules find nothing in", async () => {
    writeFileSync(config, JSON.stringify(PERMISSIVE), "utf8");
    expect(findings(PERMISSIVE).length).toBeGreaterThan(0);

    await expect(main(["harden", "--dir", directory])).resolves.toBe(0);

    expect(findings(written())).toEqual([]);
    expect(output).toContain("bash: ");
    expect(output).toContain("the static rules find nothing risky in the hardened file");
  });

  it("keeps what the user denied and every key outside the top-level permission block", async () => {
    writeFileSync(config, JSON.stringify(PERMISSIVE), "utf8");

    await main(["harden", "--dir", directory]);
    const result = written();

    expect(result["$schema"]).toBe(PERMISSIVE.$schema);
    expect(result["mcp"]).toEqual(PERMISSIVE.mcp);
    expect((result["permission"] as Record<string, unknown>)["bash"]).toEqual({ "*": "ask", "rm -rf /": "deny" });
  });

  it("leaves an agent's own permissions alone and names what is still risky there", async () => {
    const agent = { risky: { mode: "subagent", permission: { bash: "allow" } } };
    writeFileSync(config, JSON.stringify({ permission: { bash: "allow" }, agent }), "utf8");

    await main(["harden", "--dir", directory]);

    expect(written()["agent"]).toEqual(agent);
    expect(findings(written())).toContain("shell-unrestricted risky");
    expect(output).toContain("still risky");
    expect(output).toContain("Can run any command without asking: agent risky (/agent/risky/permission/bash)");
  });

  it("does not loosen the plan agent, which may not edit files", async () => {
    writeFileSync(config, JSON.stringify({ permission: {} }), "utf8");

    await main(["harden", "--dir", directory]);

    expect(EffectivePermissions.of(written()).decide("plan", "edit", "src/app.ts").action).toBe("deny");
    expect(EffectivePermissions.of(written()).decide("build", "edit", "AGENTS.md").action).toBe("ask");
    expect(EffectivePermissions.of(written()).decide("build", "read", ".env.example").action).toBe("allow");
  });

  it("puts the original bytes back on undo, even after hardening twice", async () => {
    writeFileSync(config, JSON.stringify(PERMISSIVE, null, 4), "utf8");
    const bytes = readFileSync(config);

    await main(["harden", "--dir", directory]);
    await main(["harden", "--dir", directory]);
    await expect(main(["harden", "--dir", directory, "--undo"])).resolves.toBe(0);

    expect(readFileSync(config).equals(bytes)).toBe(true);
    expect(existsSync(join(directory, ".opencode"))).toBe(false);
  });

  it("creates a configuration when the project has none, and undo removes it", async () => {
    await expect(main(["harden", "--dir", directory])).resolves.toBe(0);
    expect(findings(written())).toEqual([]);

    await main(["harden", "--dir", directory, "--undo"]);

    expect(existsSync(config)).toBe(false);
  });

  it.each([
    ["opencode.json holds comments", "opencode.json", '{\n  // keep me\n  "permission": { "bash": "allow" }\n}\n'],
    ["the project uses opencode.jsonc", "opencode.jsonc", '{ "permission": { "bash": "allow" } }\n'],
    ["opencode.json is not an object", "opencode.json", "[1, 2]\n"],
  ])("refuses and changes nothing when %s", async (_, name, content) => {
    writeFileSync(join(directory, name), content, "utf8");

    await expect(main(["harden", "--dir", directory])).resolves.toBe(1);

    expect(readFileSync(join(directory, name), "utf8")).toBe(content);
    expect(existsSync(join(directory, ".opencode"))).toBe(false);
    expect(existsSync(config)).toBe(name === "opencode.json");
  });

  it("fails to undo when nothing was hardened", async () => {
    await expect(main(["harden", "--dir", directory, "--undo"])).resolves.toBe(1);
    expect(output).toContain("nothing to undo");
  });
});
