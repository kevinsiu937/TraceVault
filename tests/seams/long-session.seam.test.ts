import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WorkflowScannerAssembly } from "../../src/cli/WorkflowScannerAssembly.js";
import type { Event } from "../../src/schema/Event.js";

const RULES = join(import.meta.dirname, "../../rules");
const FIXTURES = join(import.meta.dirname, "../fixtures");
// The rules whose first step matches often and whose second may come much later.
const SOURCES = ["destructive-action", "exfiltration-chain", "runs-written-file", "phase-2-exit"];
const CYCLES = 40;

function events(name: string): readonly Event[] {
  return (JSON.parse(readFileSync(join(FIXTURES, "rules", name, "trigger.json"), "utf8")) as { events: readonly Event[] }).events;
}

/** Two files written, then one command that runs both: only the older write's match may close on it. */
function twoWritesOneRun(template: Event): Event[] {
  const write = (path: string): Event => ({ ...template, id: `evt_both_w_${path}`, type: "document.access", data: { path: `/home/dev/demo/${path}`, operation: "write", outcome: "ok" } });
  const run = { hook: "tool.execute.after", target_tool: "bash", target: "bash b.sh && bash a.sh", exit_code: 0, outcome: "ok" };
  return [write("a.sh"), write("b.sh"), { ...template, id: "evt_both_run", type: "hook.script", data: run }];
}

/** The four trigger fixtures' actions, repeated with fresh ids and 37 s apart, so the 30-minute window opens and closes many times. */
function longSession(): Event[] {
  const start = events("runs-written-file").find((event) => event.type === "session.start");
  const actions = SOURCES.flatMap(events).filter((event) => !event.type.startsWith("session."));
  actions.push(...twoWritesOneRun(actions[0]!));
  const base = Date.UTC(2026, 10, 16, 9);
  const at = (index: number): string => new Date(base + index * 37_000).toISOString();
  const session: Event[] = [{ ...start!, id: "evt_long_start", session_id: "ses_long", timestamp: at(0) }];
  for (let cycle = 0; cycle < CYCLES; cycle += 1) {
    for (const action of actions) {
      session.push({ ...action, id: `evt_long_${cycle}_${action.id}`, session_id: "ses_long", timestamp: at(session.length) });
    }
  }
  return session;
}

describe("seam C: a long session with many first steps", () => {
  it("raises the same findings, with the same event ids, as the matcher before ticket 82", () => {
    const expected = JSON.parse(readFileSync(join(FIXTURES, "long-session-findings.json"), "utf8")) as {
      readonly expect: readonly { readonly rule: string; readonly events: readonly string[] }[];
    };
    const found = new WorkflowScannerAssembly()
      .fromDirectory(RULES)
      .scan(longSession())
      .map((finding) => ({ rule: finding.ruleId, events: finding.eventIds }));

    expect(expected.expect.length).toBeGreaterThan(CYCLES);
    expect(found).toEqual(expected.expect);
  });
});
