import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorkflowScannerAssembly } from "../../src/cli/WorkflowScannerAssembly.js";
import type { Event } from "../../src/schema/Event.js";

const RULES = join(import.meta.dirname, "../../rules");
const FIXTURES = join(import.meta.dirname, "../fixtures/rules");

interface RuleFixture {
  readonly source: "recorded" | "authored";
  readonly note?: string;
  readonly events: readonly Event[];
  readonly expect: readonly { readonly rule: string; readonly events: readonly string[] }[];
}

function fixture(ruleId: string, name: "trigger" | "clean"): RuleFixture {
  return JSON.parse(readFileSync(join(FIXTURES, ruleId, `${name}.json`), "utf8")) as RuleFixture;
}

const ruleIds = readdirSync(RULES)
  .filter((file) => file.endsWith(".yaml"))
  .map((file) => basename(file, ".yaml"));

describe("seam C: rule fixtures in, findings out", () => {
  const scanner = new WorkflowScannerAssembly().fromDirectory(RULES);

  it("has at least one rule to check", () => {
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
          .scan(trigger.events)
          .filter((finding) => finding.ruleId === ruleId)
          .map((finding) => ({ rule: finding.ruleId, events: finding.eventIds }));

        expect(trigger.expect.length).toBeGreaterThan(0);
        expect(found).toEqual(trigger.expect);
      });

      it("raises each finding exactly when its last event arrives", () => {
        const trigger = fixture(ruleId, "trigger");

        trigger.events.forEach((event, index) => {
          const prefix = trigger.events.slice(0, index + 1);
          const arrived = new Set(prefix.map((candidate) => candidate.id));
          const due = trigger.expect.filter((finding) => finding.events.every((id) => arrived.has(id)));
          const found = scanner
            .scan(prefix)
            .filter((finding) => finding.ruleId === ruleId)
            .map((finding) => ({ rule: finding.ruleId, events: finding.eventIds }));

          expect(found, `after ${event.id}`).toEqual(due);
        });
      });

      it("stays silent on its clean fixture", () => {
        const clean = fixture(ruleId, "clean");

        expect(scanner.scan(clean.events).filter((finding) => finding.ruleId === ruleId)).toEqual([]);
      });
    });
  }

  it("names the pattern that matched each chain", () => {
    const found = scanner
      .scan(fixture("exfiltration-chain", "trigger").events)
      .filter((finding) => finding.ruleId === "exfiltration-chain");

    expect(found.map((finding) => finding.matched)).toEqual([["shell egress"], ["MCP call"]]);
  });

  it("says nothing about scope when the session's project folder is unknown", () => {
    const events = fixture("scope-drift", "trigger").events.map((event) =>
      event.type === "session.start" ? { ...event, data: { title: "fixture" } } : event,
    );

    expect(scanner.scan(events).filter((finding) => finding.ruleId === "scope-drift")).toEqual([]);
  });

  it("reports the rule's version, severity and explanation with a digest of the rule set", () => {
    const [finding] = scanner.scan(fixture("self-modification", "trigger").events);

    expect(finding?.ruleVersion).toBe(1);
    expect(finding?.severity).toBe("high");
    expect(finding?.explanation).toContain("changed its own configuration");
    expect(finding?.ruleSetDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});

describe("seam C: loading rule files", () => {
  let directory: string;

  const VALID = `id: probe
version: 1
severity: low
explanation: A probe rule.
steps:
  - match:
      type: { equals: document.access }
`;

  function write(name: string, content: string): void {
    writeFileSync(join(directory, name), content, "utf8");
  }

  function load(): () => unknown {
    return () => new WorkflowScannerAssembly().fromDirectory(directory);
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-rules-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("loads a valid rule file", () => {
    write("probe.yaml", VALID);

    expect(load()).not.toThrow();
  });

  it("names the file and the key when a rule has an unknown key", () => {
    write("probe.yaml", `${VALID}owner: someone\n`);

    expect(load()).toThrow(/probe\.yaml: owner: unknown key/);
  });

  it("names the file and the field when a required field is missing", () => {
    write("probe.yaml", VALID.replace("severity: low\n", ""));

    expect(load()).toThrow(/probe\.yaml: severity: required/);
  });

  it("names the file and the field when a pattern is not usable", () => {
    write("probe.yaml", VALID.replace("type: { equals: document.access }", "path: { glob: [42] }"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.match\.path\.glob: /);
  });

  it("rejects a condition on a fact events do not have", () => {
    write("probe.yaml", VALID.replace("type: { equals: document.access }", "colour: { equals: red }"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.match\.colour: unknown fact/);
  });

  it("rejects a match operator it does not know", () => {
    write("probe.yaml", VALID.replace("{ equals: document.access }", "{ like: document.access }"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.match\.type: unknown operator 'like'/);
  });

  it("rejects a reference to a list that does not exist", () => {
    write("probe.yaml", VALID.replace("type: { equals: document.access }", "path: { glob: { list: nowhere } }"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.match\.path\.glob: unknown list 'nowhere'/);
  });

  it("rejects a regular expression that does not compile", () => {
    write("probe.yaml", VALID.replace("type: { equals: document.access }", "target: { regex: '(' }"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.match\.target\.regex: /);
  });

  it("requires a window on a rule with more than one step", () => {
    write("probe.yaml", `${VALID}  - match:\n      type: { equals: hook.script }\n`);

    expect(load()).toThrow(/probe\.yaml: window: required/);
  });

  it("rejects a repeat that is not a positive whole number", () => {
    write("probe.yaml", `${VALID.replace("  - match:", "  - repeat: 0\n    match:")}window: { seconds: 60 }\n`);

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.repeat: must be a whole number of at least 1/);
  });

  it("requires a window on a step that repeats", () => {
    write("probe.yaml", VALID.replace("  - match:", "  - repeat: 2\n    match:"));

    expect(load()).toThrow(/probe\.yaml: window: required/);
  });

  it("allows 'each' only on a rule's last step", () => {
    write("probe.yaml", `${VALID.replace("  - match:", "  - each: true\n    match:")}  - match:\n      type: { equals: hook.script }\nwindow: { seconds: 60 }\n`);

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.each: only the last step may say each/);
  });

  it("rejects a binding of a fact events do not have", () => {
    write("probe.yaml", VALID.replace("      type: { equals: document.access }\n", "      type: { equals: document.access }\n    bind: { colour: shade }\n"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.bind\.colour: unknown fact/);
  });

  it("rejects a rule whose id differs from its file name", () => {
    write("other.yaml", VALID);

    expect(load()).toThrow(/other\.yaml: id: must match the file name/);
  });

  it("gives the rule set a new digest when a rule file changes", () => {
    cpSync(RULES, directory, { recursive: true });
    const events = fixture("self-modification", "trigger").events;
    const before = new WorkflowScannerAssembly().fromDirectory(directory).scan(events)[0]?.ruleSetDigest;
    const again = new WorkflowScannerAssembly().fromDirectory(directory).scan(events)[0]?.ruleSetDigest;
    const file = join(directory, "self-modification.yaml");
    writeFileSync(file, readFileSync(file, "utf8").replace("version: 1", "version: 2"), "utf8");
    const after = new WorkflowScannerAssembly().fromDirectory(directory).scan(events)[0]?.ruleSetDigest;

    expect(again).toBe(before);
    expect(after).not.toBe(before);
  });
});
