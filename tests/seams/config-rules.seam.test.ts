import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConfigRuleLoader } from "../../src/scanner/static/ConfigRuleLoader.js";
import { StaticScanner } from "../../src/scanner/static/StaticScanner.js";
import type { StaticScannerPort } from "../../src/scanner/static/StaticScannerPort.js";
import { EventFactory } from "../../src/schema/EventFactory.js";

const RULES = join(import.meta.dirname, "../../rules/config");
const FIXTURES = join(import.meta.dirname, "../fixtures/config-rules");

interface ConfigRuleFixture {
  readonly source: "recorded" | "authored";
  readonly note?: string;
  readonly config: Record<string, unknown>;
  readonly expect: readonly { readonly subject: string; readonly entry: string; readonly example: string }[];
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
          .scan(snapshot(trigger.config))
          .filter((finding) => finding.ruleId === ruleId)
          .map(({ subject, entry, example }) => ({ subject, entry, example }));

        expect(trigger.expect.length).toBeGreaterThan(0);
        expect(found).toEqual(trigger.expect);
      });

      it("stays silent on its clean fixture", () => {
        const clean = fixture(ruleId, "clean");

        expect(scanner.scan(snapshot(clean.config)).filter((finding) => finding.ruleId === ruleId)).toEqual([]);
      });
    });
  }

  it("names the rule, its source and the snapshot event behind every finding", () => {
    const event = snapshot(fixture("shell-unrestricted", "trigger").config);

    const [finding] = scanner.scan(event);

    expect(finding).toEqual({
      ruleId: "shell-unrestricted",
      ruleVersion: 1,
      ruleSetDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      severity: "high",
      explanation: expect.any(String),
      source: { kind: "owasp-agentic", id: "ASI05", title: "Unexpected Code Execution" },
      subject: "build",
      entry: "/agent/build/permission/bash",
      example: "rm -rf /",
      eventIds: [event.id],
    });
  });

  it("says a finding comes from OpenCode's defaults when the configuration never mentions the shell", () => {
    const entries = scanner
      .scan(snapshot({}))
      .filter((finding) => finding.ruleId === "shell-unrestricted")
      .map((finding) => `${finding.subject}: ${finding.entry}`);

    expect(entries).toEqual(["build: OpenCode default", "plan: OpenCode default", "general: OpenCode default", "explore: OpenCode default"]);
  });
});

describe("seam C: the static rule loader", () => {
  let directory: string;
  const VALID = `id: probe
version: 1
severity: low
explanation: A probe rule.
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
    ["an id that is not the file name", VALID.replace("id: probe", "id: other"), /probe\.yaml: id: must match the file name/],
    ["an unknown source kind", VALID.replace("kind: baseline", "kind: blog"), /probe\.yaml: source\.kind: /],
    ["a published source without its id", VALID.replace("kind: baseline", "kind: cve"), /probe\.yaml: source\.id: required/],
    ["an unknown subject", VALID.replace("subject: agent", "subject: plugin"), /probe\.yaml: subject: /],
    ["an unknown check", VALID.replace("allows:", "forbids:"), /probe\.yaml: when\[0\]: /],
    ["a check without a target", VALID.replace(', target: "rm -rf /"', ""), /probe\.yaml: when\[0\]\.allows\.target: /],
    ["an empty check list", VALID.replace(/when:\n.*\n$/, "when: []\n"), /probe\.yaml: when: /],
    ["broken YAML", "id: [unclosed\n", /probe\.yaml: yaml: /],
  ])("names the file and the field for %s", (_, content, message) => {
    write(content);

    expect(load()).toThrow(message);
  });

  it("refuses a .yml file instead of skipping it", () => {
    writeFileSync(join(directory, "probe.yml"), VALID, "utf8");

    expect(load()).toThrow(/probe\.yml: file name: rename it to probe\.yaml/);
  });
});
