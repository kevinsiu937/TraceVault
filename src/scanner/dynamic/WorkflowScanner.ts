import type { Event } from "../../schema/Event.js";
import { EventFacts } from "../../schema/EventFacts.js";
import type { Finding } from "../../schema/Finding.js";
import type { RuleSet } from "./RuleSet.js";
import { RuleSetScan } from "./RuleSetScan.js";
import type { WorkflowScan } from "./WorkflowScan.js";
import type { WorkflowScannerPort } from "./WorkflowScannerPort.js";

/** Feeds a session's events, in order, to one matcher per rule. Pure: no clock, no storage. */
export class WorkflowScanner implements WorkflowScannerPort {
  constructor(private readonly ruleSet: RuleSet) {}

  scan(events: readonly Event[]): Finding[] {
    const scan = this.begin();
    return events.flatMap((event) => scan.next(event));
  }

  begin(): WorkflowScan {
    return new RuleSetScan(this.ruleSet);
  }

  blockedBy(call: Event): string | null {
    const facts = EventFacts.of(call);
    const rule = this.ruleSet.rules.find((candidate) => candidate.blockable && candidate.steps[0].match(facts, new Map()) !== null);
    return rule?.id ?? null;
  }
}
