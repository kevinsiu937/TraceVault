import type { EventFacts } from "../../schema/EventFacts.js";
import type { Finding } from "../../schema/Finding.js";
import type { Bindings } from "./Condition.js";
import type { Rule } from "./Rule.js";

interface PartialMatch {
  readonly startedAt: number;
  readonly eventIds: readonly string[];
  readonly matched: readonly string[];
  readonly next: number;
  /** How many times the current step has matched so far, for a step that repeats. */
  readonly count: number;
  readonly bound: Bindings;
}

/**
 * One rule's partial matches over one session, fed one event at a time in
 * timeline order. A partial match expires when it outlives the window and
 * closes exactly once, on the event that satisfies its last step. An event
 * that advances an open match does not also start a new one, so repeated
 * steps never produce overlapping findings.
 */
export class RuleMatcher {
  private open: PartialMatch[] = [];

  constructor(
    private readonly rule: Rule,
    private readonly ruleSetDigest: string,
  ) {}

  observe(eventId: string, at: number, facts: EventFacts): Finding[] {
    const findings: Finding[] = [];
    const stillOpen: PartialMatch[] = [];
    let consumed = false;

    for (const partial of this.open) {
      if (this.rule.window !== null && !this.rule.window.contains(partial.startedAt, at)) {
        continue;
      }
      const advanced = this.advance(partial, eventId, facts);
      if (advanced !== null) {
        consumed = true;
      }
      if (advanced === null) {
        stillOpen.push(partial);
      } else if (advanced.next === this.rule.steps.length) {
        findings.push(this.finding(advanced));
        if (this.rule.steps[partial.next]?.each === true) {
          stillOpen.push(partial);
        }
      } else {
        stillOpen.push(advanced);
      }
    }

    const started = consumed
      ? null
      : this.advance({ startedAt: at, eventIds: [], matched: [], next: 0, count: 0, bound: new Map() }, eventId, facts);
    if (started !== null) {
      if (started.next === this.rule.steps.length) {
        findings.push(this.finding(started));
      } else {
        stillOpen.push(started);
      }
    }

    this.open = stillOpen;
    return findings;
  }

  private advance(partial: PartialMatch, eventId: string, facts: EventFacts): PartialMatch | null {
    const step = this.rule.steps[partial.next];
    const hit = step === undefined ? null : step.match(facts, partial.bound);
    if (hit === null) {
      return null;
    }
    const count = partial.count + 1;
    const done = step !== undefined && count >= step.repeat;
    const last = partial.matched[partial.matched.length - 1];
    return {
      startedAt: partial.startedAt,
      eventIds: [...partial.eventIds, eventId],
      matched: hit.label === null || hit.label === last ? partial.matched : [...partial.matched, hit.label],
      next: done ? partial.next + 1 : partial.next,
      count: done ? 0 : count,
      bound: hit.bound,
    };
  }

  private finding(match: PartialMatch): Finding {
    return {
      ruleId: this.rule.id,
      ruleVersion: this.rule.version,
      ruleSetDigest: this.ruleSetDigest,
      severity: this.rule.severity,
      explanation: this.rule.explanation,
      eventIds: match.eventIds,
      matched: match.matched,
    };
  }
}
