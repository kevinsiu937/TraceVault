import type { Event } from "../../schema/Event.js";
import { EventFacts } from "../../schema/EventFacts.js";
import type { Finding } from "../../schema/Finding.js";
import { RuleMatcher } from "./RuleMatcher.js";
import type { RuleSet } from "./RuleSet.js";
import { SESSION_PROJECT } from "./ShellScripts.js";
import type { WorkflowScannerPort } from "./WorkflowScannerPort.js";

/** Feeds a session's events, in order, to one matcher per rule. Pure: no clock, no storage. */
export class WorkflowScanner implements WorkflowScannerPort {
  constructor(private readonly ruleSet: RuleSet) {}

  scan(events: readonly Event[]): Finding[] {
    const matchers = this.ruleSet.rules.map((rule) => new RuleMatcher(rule, this.ruleSet.digest));
    const findings: Finding[] = [];
    // What every match may know about the session itself, from the moment its start is seen.
    const session = new Map<string, string>();

    for (const event of events) {
      const facts = EventFacts.of(event);
      const project = facts.get("project");
      if (project !== null && project !== "") {
        session.set(SESSION_PROJECT, project);
      }
      const at = Date.parse(event.timestamp);
      for (const matcher of matchers) {
        findings.push(...matcher.observe(event.id, at, facts, session));
      }
    }

    return findings;
  }

  blockedBy(call: Event): string | null {
    const facts = EventFacts.of(call);
    const rule = this.ruleSet.rules.find((candidate) => candidate.blockable && candidate.steps[0].match(facts, new Map()) !== null);
    return rule?.id ?? null;
  }
}
