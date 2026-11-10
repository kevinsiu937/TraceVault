import type { EventFacts, FactName } from "../../schema/EventFacts.js";
import type { Bindings, Condition } from "./Condition.js";

/** One way a step can match: every condition must hold on the same event. */
export interface StepAlternative {
  readonly label: string | null;
  readonly conditions: ReadonlyMap<FactName, Condition>;
}

/** How a step matched an event: which labelled alternative, and what it bound. */
export interface StepMatch {
  readonly label: string | null;
  readonly bound: Bindings;
}

/** One step of a rule: it matches when any of its alternatives does, `repeat` times over. */
export class RuleStep {
  constructor(
    private readonly alternatives: readonly StepAlternative[],
    readonly repeat: number = 1,
    /** On the last step: every matching event closes its own finding, and the match stays open. */
    readonly each: boolean = false,
    /** Facts this step remembers for later steps, as binding name by fact. A missing fact stays unbound. */
    private readonly binds: ReadonlyMap<FactName, string> = new Map(),
  ) {}

  match(facts: EventFacts, bound: Bindings): StepMatch | null {
    for (const alternative of this.alternatives) {
      if (!this.holds(alternative, facts, bound)) {
        continue;
      }
      const next = new Map(bound);
      for (const [fact, name] of this.binds) {
        const value = facts.get(fact);
        if (value !== null) {
          next.set(name, value);
        }
      }
      return { label: alternative.label, bound: next };
    }
    return null;
  }

  /** Whether any alternative of this step tests the fact. */
  tests(fact: FactName): boolean {
    return this.alternatives.some((alternative) => alternative.conditions.has(fact));
  }

  private holds(alternative: StepAlternative, facts: EventFacts, bound: Bindings): boolean {
    for (const [fact, condition] of alternative.conditions) {
      if (!condition.matches(facts.get(fact), bound)) {
        return false;
      }
    }
    return true;
  }
}
