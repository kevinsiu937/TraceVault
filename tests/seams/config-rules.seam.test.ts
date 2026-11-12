import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigRuleLoader } from "../../src/scanner/static/ConfigRuleLoader.js";
import { EffectivePermissions } from "../../src/scanner/static/EffectivePermissions.js";
import { StaticScanner } from "../../src/scanner/static/StaticScanner.js";
import type { StaticScannerPort } from "../../src/scanner/static/StaticScannerPort.js";
import { EventFactory } from "../../src/schema/EventFactory.js";

const RULES = join(import.meta.dirname, "../../rules/config");
const FIXTURES = join(import.meta.dirname, "../fixtures/config-rules");

interface ConfigRuleFixture {
  readonly source: "recorded" | "authored";
  readonly note?: string;
  readonly config: Record<string, unknown>;
  /** The latest tool list of each local MCP server, as the relay recorded them. */
  readonly tools?: readonly { readonly server: string; readonly tools: readonly Record<string, unknown>[] }[];
  readonly expect: readonly { readonly subject: string; readonly evidence: readonly { label?: string; value: string; entry: string }[] }[];
}

function fixture(ruleId: string, name: "trigger" | "clean"): ConfigRuleFixture {
  return JSON.parse(readFileSync(join(FIXTURES, ruleId, `${name}.json`), "utf8")) as ConfigRuleFixture;
}

function snapshot(config: Record<string, unknown>) {
  const event = new EventFactory().configSnapshot(
    { sessionId: "ses_fixture", correlationId: null, receivedAt: new Date("2026-11-11T10:00:00.000Z") },
    { digest: "sha256:fixture", config },
  );
  if (event.type !== "config.snapshot") {
    throw new TypeError("not a snapshot");
  }
  return event;
}

function toolLists(fixture: ConfigRuleFixture) {
  return (fixture.tools ?? []).map(({ server, tools }) => {
    const event = new EventFactory().mcpTools(
      { sessionId: "ses_fixture", correlationId: null, receivedAt: new Date("2026-11-11T10:00:01.000Z") },
      { server, digest: "sha256:fixture", tools },
    );
    if (event.type !== "mcp.tools") {
      throw new TypeError("not a tool list");
    }
    return event;
  });
}

function scannerFor(directory: string): StaticScannerPort {
  return new StaticScanner(new ConfigRuleLoader().loadDirectory(directory));
}

const ruleIds = readdirSync(RULES)
  .filter((file) => file.endsWith(".yaml"))
  .map((file) => basename(file, ".yaml"));

describe("seam C: a configuration in, static findings out", () => {
  const scanner = scannerFor(RULES);

  it("has at least one static rule to check", () => {
    expect(ruleIds.length).toBeGreaterThan(0);
  });

  for (const ruleId of ruleIds) {
    describe(ruleId, () => {
      it("ships a trigger fixture and a clean fixture", () => {
        expect(existsSync(join(FIXTURES, ruleId, "trigger.json"))).toBe(true);
        expect(existsSync(join(FIXTURES, ruleId, "clean.json"))).toBe(true);
      });

      it("raises exactly the expected findings on its trigger fixture", () => {
        const trigger = fixture(ruleId, "trigger");
        const found = scanner
          .scan(snapshot(trigger.config), toolLists(trigger))
          .filter((finding) => finding.ruleId === ruleId)
          .map(({ subject, evidence }) => ({ subject, evidence }));

        expect(trigger.expect.length).toBeGreaterThan(0);
        expect(found).toEqual(trigger.expect);
      });

      it("says what to do about each finding it raises", () => {
        const trigger = fixture(ruleId, "trigger");
        const found = scanner.scan(snapshot(trigger.config), toolLists(trigger)).filter((finding) => finding.ruleId === ruleId);

        expect(found.length).toBeGreaterThan(0);
        expect(found.every((finding) => finding.recommendation.trim().length > 0)).toBe(true);
        expect(found.every((finding) => finding.title.trim().length > 0)).toBe(true);
      });

      it("stays silent on its clean fixture", () => {
        const clean = fixture(ruleId, "clean");

        expect(scanner.scan(snapshot(clean.config), toolLists(clean)).filter((finding) => finding.ruleId === ruleId)).toEqual([]);
      });
    });
  }

  it("names the rule, its source and the snapshot event behind every finding", () => {
    const event = snapshot(fixture("shell-unrestricted", "trigger").config);

    const finding = scanner.scan(event).find((candidate) => candidate.ruleId === "shell-unrestricted");

    expect(finding).toEqual({
      ruleId: "shell-unrestricted",
      ruleVersion: 1,
      ruleSetDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      severity: "high",
      title: "Can run any command without asking",
      explanation: expect.any(String),
      recommendation: expect.stringContaining("set bash to ask"),
      source: { kind: "owasp-agentic", id: "ASI05", title: "Unexpected Code Execution" },
      subjectKind: "agent",
      subject: "build",
      evidence: [{ value: "rm -rf /", entry: "/agent/build/permission/bash" }],
      eventIds: [event.id],
    });
  });

  it("says a finding comes from OpenCode's defaults when the configuration never mentions the shell", () => {
    const entries = scanner
      .scan(snapshot({}))
      .filter((finding) => finding.ruleId === "shell-unrestricted")
      .map((finding) => `${finding.subject}: ${finding.evidence[0]?.entry}`);

    expect(entries).toEqual(["build: OpenCode default", "plan: OpenCode default", "general: OpenCode default", "explore: OpenCode default"]);
  });
});

describe("seam C: what each static rule family looks at", () => {
  const scanner = scannerFor(RULES);

  function found(ruleId: string, config: Record<string, unknown>) {
    return scanner
      .scan(snapshot(config))
      .filter((finding) => finding.ruleId === ruleId)
      .map(({ subject, evidence }) => ({ subject, evidence }));
  }

  it("points a configuration edit at the agent block that re-allows it after a top-level deny", () => {
    const config = {
      permission: { edit: { "*": "allow", "opencode.json": "deny", "opencode.jsonc": "deny", ".opencode/*": "deny", "AGENTS.md": "deny" } },
      agent: { build: { permission: { edit: "allow" } } },
    };

    expect(found("config-self-edit", config)).toEqual([
      { subject: "build", evidence: [{ value: "opencode.json", entry: "/agent/build/permission/edit" }] },
    ]);
  });

  it("never reports a question that OpenCode's own defaults leave unasked, such as explore reading .env", () => {
    expect(EffectivePermissions.of({}).decide("explore", "read", ".env")).toEqual({ action: "allow", entry: "OpenCode default" });
    expect(found("default-ask-removed", {})).toEqual([]);
  });

  it("counts an enabled remote MCP server as a way out, except for explore, which may not call MCP tools", () => {
    const server = { type: "remote", url: "https://mcp.example.com/mcp" };
    const route = { label: "remote-mcp", value: "https://mcp.example.com/mcp", entry: "OpenCode default" };
    const local = { type: "local", command: ["npx", "server-files"] };
    const config = (enabled: boolean) => ({ permission: { webfetch: "deny", bash: "ask" }, mcp: { files: local, docs: { ...server, enabled } } });

    expect(found("read-and-egress", config(true))).toEqual(
      ["build", "plan", "general"].map((subject) => ({ subject, evidence: [{ value: "id_rsa", entry: "OpenCode default" }, route] })),
    );
    expect(found("read-and-egress", config(false))).toEqual([]);
  });

  it("matches a server's tools the way OpenCode names them, so a deny on them closes the route", () => {
    const config = { permission: { webfetch: "deny", bash: "ask", "my_docs_*": "ask" }, mcp: { "my.docs": { type: "remote", url: "https://mcp.example.com/mcp" } } };

    expect(found("read-and-egress", config)).toEqual([]);
  });
});

describe("seam C: tool findings", () => {
  it("point at the tool list event they came from, not at the configuration", () => {
    const trigger = fixture("tool-invisible-text", "trigger");
    const lists = toolLists(trigger);
    const [list] = lists;

    const ids = scannerFor(RULES)
      .scan(snapshot(trigger.config), lists)
      .filter((finding) => finding.subjectKind === "tool")
      .map((finding) => finding.eventIds);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((eventIds) => eventIds.length === 1 && eventIds[0] === list?.id)).toBe(true);
  });
});

describe("seam C: the static rule loader", () => {
  let directory: string;
  const VALID = `id: probe
version: 1
severity: low
title: Probe.
explanation: A probe rule.
recommendation: Check the probe.
source: { kind: baseline, title: Least privilege }
subject: agent
when:
  - allows: { permission: bash, target: "rm -rf /" }
`;

  function write(content: string): void {
    writeFileSync(join(directory, "probe.yaml"), content, "utf8");
  }

  function load(): () => unknown {
    return () => scannerFor(directory);
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-config-rules-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("loads a valid rule file", () => {
    write(VALID);

    expect(load()).not.toThrow();
  });

  it.each([
    ["an unknown key", `${VALID}owner: someone\n`, /probe\.yaml: owner: unknown key/],
    ["a missing field", VALID.replace("severity: low\n", ""), /probe\.yaml: severity: required/],
    ["a missing title", VALID.replace("title: Probe.\n", ""), /probe\.yaml: title: required/],
    ["a missing recommendation", VALID.replace("recommendation: Check the probe.\n", ""), /probe\.yaml: recommendation: required/],
    ["an empty recommendation", VALID.replace("recommendation: Check the probe.", 'recommendation: "  "'), /probe\.yaml: recommendation: /],
    ["an id that is not the file name", VALID.replace("id: probe", "id: other"), /probe\.yaml: id: must match the file name/],
    ["an unknown source kind", VALID.replace("kind: baseline", "kind: blog"), /probe\.yaml: source\.kind: /],
    ["a published source without its id", VALID.replace("kind: baseline", "kind: cve"), /probe\.yaml: source\.id: required/],
    ["an unknown subject", VALID.replace("subject: agent", "subject: plugin"), /probe\.yaml: subject: /],
    ["an unknown check", VALID.replace("allows:", "forbids:"), /probe\.yaml: when\[0\]: /],
    ["a check without a target", VALID.replace(', target: "rm -rf /"', ""), /probe\.yaml: when\[0\]\.allows\.target: /],
    ["an empty check list", VALID.replace(/when:\n.*\n$/, "when: []\n"), /probe\.yaml: when: /],
    ["broken YAML", "id: [unclosed\n", /probe\.yaml: yaml: /],
    ["an alternative without a label", VALID.replace('  - allows: { permission: bash, target: "rm -rf /" }', '  - any:\n      - allows: { permission: bash, target: "rm -rf /" }'), /probe\.yaml: when\[0\]\.any\[0\]\.label: required/],
    ["a configured flag that is not a boolean", VALID.replace('target: "rm -rf /" }', 'target: "rm -rf /", configured: yes }'), /probe\.yaml: when\[0\]\.allows\.configured: /],
    ["a check that does not suit the subject", VALID.replace("subject: agent", "subject: mcp-server"), /probe\.yaml: when\[0\]: allows needs subject agent/],
    ["a fact the subject does not have", VALID.replace("subject: agent", "subject: mcp-server").replace('  - allows: { permission: bash, target: "rm -rf /" }', '  - match: { colour: { regex: red } }'), /probe\.yaml: when\[0\]\.match\.colour: /],
    ["an operator facts do not support", VALID.replace("subject: agent", "subject: mcp-server").replace('  - allows: { permission: bash, target: "rm -rf /" }', '  - match: { secret_keys: { equals: TOKEN } }'), /probe\.yaml: when\[0\]\.match\.secret_keys: /],
    ["a regex that does not compile", VALID.replace("subject: agent", "subject: mcp-server").replace('  - allows: { permission: bash, target: "rm -rf /" }', '  - match: { secret_keys: { regex: "(" } }'), /probe\.yaml: when\[0\]\.match\.secret_keys\.regex: /],
  ])("names the file and the field for %s", (_, content, message) => {
    write(content);

    expect(load()).toThrow(message);
  });

  it("refuses a .yml file instead of skipping it", () => {
    writeFileSync(join(directory, "probe.yml"), VALID, "utf8");

    expect(load()).toThrow(/probe\.yml: file name: rename it to probe\.yaml/);
  });
});
