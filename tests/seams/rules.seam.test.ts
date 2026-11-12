import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

      it("says what to do about each finding it raises", () => {
        const found = scanner.scan(fixture(ruleId, "trigger").events).filter((finding) => finding.ruleId === ruleId);

        expect(found.length).toBeGreaterThan(0);
        expect(found.every((finding) => finding.recommendation.trim().length > 0)).toBe(true);
        expect(found.every((finding) => finding.title.trim().length > 0)).toBe(true);
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

    expect(found.map((finding) => finding.matched)).toEqual([
      ["sensitive read", "shell egress"],
      ["sensitive read", "shell egress"],
      ["sensitive read", "MCP call"],
      ["sensitive read", "shell egress"],
      ["sensitive file named in the shell", "shell egress"],
      ["sensitive read", "git push"],
    ]);
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
title: Probe.
explanation: A probe rule.
recommendation: Check the probe.
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

  it("refuses a rule without a plain title", () => {
    write("probe.yaml", VALID.replace("title: Probe.\n", ""));

    expect(load()).toThrow(/probe\.yaml: title: required/);
  });

  it.each(["", "recommendation: \"  \"\n"])("refuses a rule without a recommendation", (replacement) => {
    write("probe.yaml", VALID.replace("recommendation: Check the probe.\n", replacement));

    expect(load()).toThrow(/probe\.yaml: recommendation: /);
  });

  it("names the file and the field when a pattern is not usable", () => {
    write("probe.yaml", VALID.replace("type: { equals: document.access }", "path: { glob: [42] }"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.match\.path\.glob: /);
  });

  it("rejects a condition on a fact events do not have", () => {
    write("probe.yaml", VALID.replace("type: { equals: document.access }", "colour: { equals: red }"));

    expect(load()).toThrow(/probe\.yaml: steps\[0\]\.match\.colour: unknown fact/);
  });

  it.each(["allowed_by", "other_than"])("rejects %s without the name of an earlier binding", (operator) => {
    write("probe.yaml", VALID.replace("type: { equals: document.access }", `call: { ${operator}: [approved] }`));

    expect(load()).toThrow(new RegExp(`probe\\.yaml: steps\\[0\\]\\.match\\.call\\.${operator}: expects the name`));
  });

  it.each(["true", "false"])("loads blockable: %s on a rule that matches one event", (value) => {
    write("probe.yaml", `${VALID.replace("steps:", `blockable: ${value}\nsteps:`)}`);

    expect(load()).not.toThrow();
  });

  it.each([
    ["a second step", "window: session\nsteps:\n  - match:\n      type: { equals: session.start }\n  - match:\n      type: { equals: document.access }\n"],
    ["a repeated step", "window: { seconds: 60 }\nsteps:\n  - repeat: 2\n    match:\n      type: { equals: document.access }\n"],
    ["a test of the outcome", "steps:\n  - match:\n      outcome: { equals: ok }\n"],
    ["a test of the outcome in one alternative", "steps:\n  - any:\n      - label: read\n        match:\n          operation: { equals: read }\n      - label: refused\n        match:\n          outcome: { equals: denied }\n"],
  ])("refuses blockable on a rule with %s", (_, steps) => {
    write("probe.yaml", `${VALID.slice(0, VALID.indexOf("steps:"))}blockable: true\n${steps}`);

    expect(load()).toThrow(/probe\.yaml: blockable: only a rule that matches one event, without testing its outcome, can block/);
  });

  it("refuses a blockable value that is not true or false", () => {
    write("probe.yaml", VALID.replace("steps:", "blockable: yes\nsteps:"));

    expect(load()).toThrow(/probe\.yaml: blockable: must be true or false/);
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

  it("refuses a rule file that ends in .yml instead of skipping it", () => {
    write("probe.yml", VALID);

    expect(load()).toThrow(/probe\.yml: file name: rename it to probe\.yaml/);
  });

  it("refuses a list file that ends in .yml instead of skipping it", () => {
    write("probe.yaml", VALID);
    mkdirSync(join(directory, "lists"));
    write("lists/names.yml", "- alice\n");

    expect(load()).toThrow(/lists\/names\.yml: file name: rename it to lists\/names\.yaml/);
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

describe("seam C: matching inside a window", () => {
  let directory: string;
  const [start, denied] = fixture("probing", "trigger").events;

  function at(event: Event | undefined, id: string, seconds: number): Event {
    if (event === undefined) {
      throw new Error("the probing fixture no longer starts with a session start and a denial");
    }
    return { ...event, id, timestamp: new Date(Date.UTC(2026, 10, 7, 11) + seconds * 1000).toISOString() };
  }

  function scan(steps: string, events: readonly Event[]): string[][] {
    writeFileSync(
      join(directory, "probe.yaml"),
      `id: probe\nversion: 1\nseverity: low\ntitle: Probe.\nexplanation: A probe rule.\nrecommendation: Check the probe.\nwindow: { seconds: 60 }\nsteps:\n${steps}`,
      "utf8",
    );
    return new WorkflowScannerAssembly()
      .fromDirectory(directory)
      .scan(events)
      .map((finding) => [...finding.eventIds]);
  }

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-window-"));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("stops counting an event once it has left the window, and keeps counting the rest", () => {
    const found = scan("  - repeat: 2\n    match:\n      outcome: { equals: denied }\n", [
      at(denied, "d1", 0),
      at(denied, "d2", 100),
      at(denied, "d3", 130),
    ]);

    expect(found).toEqual([["d2", "d3"]]);
  });

  it("does not finish a chain whose first step has left the window", () => {
    const found = scan(
      "  - match:\n      type: { equals: session.start }\n  - repeat: 2\n    match:\n      outcome: { equals: denied }\n",
      [at(start, "s1", 0), at(denied, "d1", 50), at(denied, "d2", 70), at(start, "s2", 200), at(denied, "d3", 210), at(denied, "d4", 220)],
    );

    expect(found).toEqual([["s2", "d3", "d4"]]);
  });

  it("closes only the oldest match on an event that would close several, and leaves the others open", () => {
    const found = scan(
      "  - match:\n      type: { equals: session.start }\n  - match:\n      outcome: { equals: denied }\n",
      [at(start, "s1", 0), at(start, "s2", 10), at(denied, "d1", 20), at(denied, "d2", 30)],
    );

    expect(found).toEqual([["s1", "d1"], ["s2", "d2"]]);
  });
});

describe("seam C: what counts as a freeze", () => {
  const scanner = new WorkflowScannerAssembly().fromDirectory(RULES);
  const events = fixture("destructive-action", "trigger").events;
  const [start, freeze, rm] = ["evt_freeze_start", "evt_freeze_freeze", "evt_freeze_rm"].map((id) => events.find((event) => event.id === id));

  function flagged(text: string): boolean {
    if (start === undefined || freeze?.type !== "prompt.user" || rm === undefined) {
      throw new Error("the destructive-action trigger no longer has a start, a freeze prompt and an rm");
    }
    const session = [start, { ...freeze, data: { ...freeze.data, text } }, rm];
    return scanner.scan(session).some((finding) => finding.ruleId === "destructive-action");
  }

  it.each([
    "Don't delete anything.",
    "Do not remove any files.",
    "Please never delete the fixtures.",
    "Do not under any circumstances rm the database.",
    "We are in a code freeze.",
    "Switch to read-only mode.",
    "From now on, read-only please.",
    "Read-only from here.",
    "Stay read-only until I say so.",
  ])("treats %j followed by a deletion as a freeze", (text) => {
    expect(flagged(text)).toBe(true);
  });

  it.each([
    "Never mind, just delete it.",
    "Never mind just delete it.",
    "Don't forget to remove the debug logs.",
    "Don't worry, just delete the old logs.",
    "Fix the freeze bug in the scheduler.",
    "Make the email field read-only.",
    "The config is read-only, so copy it first.",
  ])("does not treat %j as a freeze", (text) => {
    expect(flagged(text)).toBe(false);
  });
});
