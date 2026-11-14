import type { Event } from "../../schema/Event.js";
import { EventFacts } from "../../schema/EventFacts.js";
import type { Finding } from "../../schema/Finding.js";
import { RuleMatcher } from "./RuleMatcher.js";
import type { RuleSet } from "./RuleSet.js";
import { SESSION_PROJECT } from "./ShellScripts.js";
import type { WorkflowScan } from "./WorkflowScan.js";

/** One matcher per rule, holding what one session has matched so far. */
export class RuleSetScan implements WorkflowScan {
  private readonly matchers: readonly RuleMatcher[];
  // What every match may know about the session itself, from the moment its start is seen.
  private readonly session = new Map<string, string>();

  constructor(ruleSet: RuleSet) {
    this.matchers = ruleSet.rules.map((rule) => new RuleMatcher(rule, ruleSet.digest));
  }

  next(event: Event): Finding[] {
    const facts = EventFacts.of(event);
    const project = facts.get("project");
    if (project !== null && project !== "") {
      this.session.set(SESSION_PROJECT, project);
    }
    const at = Date.parse(event.timestamp);
    return this.matchers.flatMap((matcher) => matcher.observe(event.id, at, facts, this.session));
  }
}
