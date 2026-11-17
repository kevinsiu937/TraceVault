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

  const STRICTNESS = { allow: 0, ask: 1, deny: 2 } as const;
  const decide = (configuration: Record<string, unknown>, permission: string, target: string) =>
    EffectivePermissions.of(configuration).decide("build", permission, target).action;

  // [what the user denied, its permission block, the calls that must not loosen]
  const DENIALS: readonly (readonly [string, unknown, readonly (readonly [string, string])[]])[] = [
    ["a read catch-all", { read: { "*": "deny" } }, [["read", ".env.example"], ["read", ".env"], ["read", "src/app.ts"]]],
    ["a read string", { read: "deny" }, [["read", ".env.example"], ["read", ".env"]]],
    ["a bash catch-all", { bash: { "*": "deny" } }, [["bash", "rm -rf /"], ["bash", "ls"]]],
    ["a webfetch catch-all", { webfetch: { "*": "deny" } }, [["webfetch", "https://example.test"]]],
    ["an edit catch-all", { edit: { "*": "deny" } }, [["edit", "opencode.json"], ["edit", "src/app.ts"]]],
    ["an overall catch-all", { "*": "deny" }, [["read", ".env.example"], ["read", ".env"], ["bash", "ls"], ["edit", "AGENTS.md"], ["webfetch", "https://example.test"]]],
    ["an overall string", "deny", [["read", ".env.example"], ["bash", "ls"]]],
    ["a broader env pattern", { read: { "*.env*": "deny" } }, [["read", ".env.local"], ["read", ".env.example"], ["read", ".env"]]],
    ["a narrower secret", { read: { "secret*": "deny" } }, [["read", "secret.env"], ["read", "secret.pem"]]],
    ["a catch-all with an allowed exception", { read: { "*": "deny", "src/*": "allow" } }, [["read", ".env"], ["read", ".env.example"], ["read", "lib/key.ts"]]],
    ["a deny before a later allow", { bash: { "rm *": "allow", "*": "deny" } }, [["bash", "rm -rf /"], ["bash", "ls"]]],
  ];

  for (const [command, args] of [
    ["harden", ["harden"]],
    ["init", ["init"]],
  ] as const) {
    it.each(DENIALS)(`${command} never loosens %s`, async (_, permission, calls) => {
      const original = { $schema: "https://opencode.ai/config.json", permission };
      writeFileSync(config, JSON.stringify(original), "utf8");

      await expect(main([...args, "--dir", directory])).resolves.toBe(0);

      for (const [tool, target] of calls) {
        const now = decide(written(), tool, target);
        expect(STRICTNESS[now], `${tool} ${target}: ${decide(original, tool, target)} -> ${now}`).toBeGreaterThanOrEqual(STRICTNESS[decide(original, tool, target)]);
      }
    });
  }

  for (const [command, args] of [
    ["harden", ["harden"]],
    ["init", ["init"]],
  ] as const) {
    it.each([
      ["the overall permission", { "*": { "rm *": "deny" } }],
      ["the bash permission", { bash: { "rm *": "deny" } }],
    ])(`${command} keeps a narrow deny under %s narrow, so other calls ask`, async (_, permission) => {
      writeFileSync(config, JSON.stringify({ permission }), "utf8");

      await expect(main([...args, "--dir", directory])).resolves.toBe(0);

      expect(decide(written(), "bash", "rm -rf x")).toBe("deny");
      expect(decide(written(), "bash", "ls")).toBe("ask");
      expect(decide(written(), "bash", "git status")).toBe("ask");
      expect(decide(written(), "webfetch", "https://example.test")).toBe("ask");
    });
  }

  it("keeps an allowed exception after a broad deny instead of refusing everything", async () => {
    writeFileSync(config, JSON.stringify({ permission: { read: { "*": "deny", "src/*": "allow" }, bash: { "*": "deny", "git status": "allow" } } }), "utf8");

    await main(["harden", "--dir", directory]);

    expect(decide(written(), "read", "src/app.ts")).toBe("allow");
    expect(decide(written(), "read", "lib/app.ts")).toBe("deny");
    expect(decide(written(), "bash", "git status")).toBe("ask");
    expect(decide(written(), "bash", "ls")).toBe("deny");
  });

  it("writes the same bytes when hardening a hardened file again", async () => {
    writeFileSync(config, JSON.stringify({ permission: { "*": "deny", read: { "*.env*": "deny" }, bash: { "*": "allow", "rm *": "deny" } } }), "utf8");

    await main(["harden", "--dir", directory]);
    const once = readFileSync(config, "utf8");
    await main(["harden", "--dir", directory]);

    expect(readFileSync(config, "utf8")).toBe(once);
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

  it("removes the configuration it created on undo, even after hardening twice", async () => {
    await main(["harden", "--dir", directory]);
    await main(["harden", "--dir", directory]);
    await expect(main(["harden", "--dir", directory, "--undo"])).resolves.toBe(0);

    expect(existsSync(config)).toBe(false);
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
