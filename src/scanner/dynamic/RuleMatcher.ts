import type { EventFacts } from "../../schema/EventFacts.js";
import type { Finding } from "../../schema/Finding.js";
import type { Bindings } from "./Condition.js";
import type { Rule } from "./Rule.js";

interface MatchedEvent {
  readonly id: string;
  readonly at: number;
  /** The alternative that matched it, for a step written with `any`. */
  readonly label: string | null;
}

interface PartialMatch {
  /** In timeline order; the window runs from the first. */
  readonly events: readonly MatchedEvent[];
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

    for (const open of this.open) {
      const partial = this.inWindow(open, at);
      if (partial === null) {
        continue;
      }
      const advanced = this.advance(partial, eventId, at, facts);
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
      : this.advance({ events: [], next: 0, count: 0, bound: new Map() }, eventId, at, facts);
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

  /**
   * The partial match as it stands at `at`, or null once it has expired. A match
   * still repeating its first step slides instead: events that have left the
   * window drop out, and the ones still inside it keep counting.
   */
  private inWindow(partial: PartialMatch, at: number): PartialMatch | null {
    const window = this.rule.window;
    const first = window === null ? 0 : partial.events.findIndex((event) => window.contains(event.at, at));
    if (first === 0) {
      return partial;
    }
    if (first < 0 || partial.next !== 0) {
      return null;
    }
    const events = partial.events.slice(first);
    return { ...partial, events, count: events.length };
  }

  private advance(partial: PartialMatch, eventId: string, at: number, facts: EventFacts): PartialMatch | null {
    const step = this.rule.steps[partial.next];
    const hit = step === undefined ? null : step.match(facts, partial.bound);
    if (hit === null) {
      return null;
    }
    const count = partial.count + 1;
    const done = step !== undefined && count >= step.repeat;
    return {
      events: [...partial.events, { id: eventId, at, label: hit.label }],
      next: done ? partial.next + 1 : partial.next,
      count: done ? 0 : count,
      bound: hit.bound,
    };
  }

  private finding(match: PartialMatch): Finding {
    const matched: string[] = [];
    for (const { label } of match.events) {
      if (label !== null && label !== matched[matched.length - 1]) {
        matched.push(label);
      }
    }
    return {
      ruleId: this.rule.id,
      ruleVersion: this.rule.version,
      ruleSetDigest: this.ruleSetDigest,
      severity: this.rule.severity,
      explanation: this.rule.explanation,
      eventIds: match.events.map((event) => event.id),
      matched,
    };
  }
}
