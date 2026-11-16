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

/** One partial match: its own events, then the run's shared events from `from` on. */
interface Member {
  /** Start order: the lower, the older. */
  readonly seq: number;
  readonly own: readonly MatchedEvent[];
  readonly from: number;
}

/**
 * Partial matches waiting at the same step with the same bindings. An event
 * advances all of them or none, and closes only the oldest, so they are held
 * once and differ only in the events that started them. With a window, a
 * member joins only if it started no earlier than the youngest, so the ones
 * that expire are always the oldest.
 */
interface Run {
  next: number;
  /** How many times the current step has matched so far, for a step that repeats. */
  count: number;
  bound: Bindings;
  /** Oldest first. A run still on the first step has exactly one member, since it slides through the window on its own. */
  members: Member[];
  shared: MatchedEvent[];
}

/**
 * One rule's partial matches over one session, fed one event at a time in
 * timeline order. A partial match expires when it outlives the window and
 * closes exactly once, on the event that satisfies its last step. An event
 * that advances an open match does not also start a new one, so repeated
 * steps never produce overlapping findings. An event closes at most one match,
 * the oldest; a younger match it would also close stays open as it was.
 */
export class RuleMatcher {
  private open: Run[] = [];
  private started = 0;

  constructor(
    private readonly rule: Rule,
    private readonly ruleSetDigest: string,
  ) {}

  /** `session` holds what a new match starts out knowing about the session, such as its project folder. */
  observe(eventId: string, at: number, facts: EventFacts, session: Bindings = new Map()): Finding[] {
    const last = this.rule.steps.length - 1;
    let closing: { run: Run; label: string | null } | null = null;
    let consumed = false;

    for (const run of this.open) {
      this.expire(run, at);
      const step = this.rule.steps[run.next];
      const hit = run.members.length === 0 || step === undefined ? null : step.match(facts, run.bound);
      if (hit === null) {
        continue;
      }
      consumed = true;
      const done = run.count + 1 >= step!.repeat;
      if (done && run.next === last) {
        if (closing === null || run.members[0]!.seq < closing.run.members[0]!.seq) {
          closing = { run, label: hit.label };
        }
        continue;
      }
      run.shared.push({ id: eventId, at, label: hit.label });
      run.next += done ? 1 : 0;
      run.count = done ? 0 : run.count + 1;
      run.bound = hit.bound;
    }

    const findings: Finding[] = [];
    if (closing !== null) {
      const { run, label } = closing;
      findings.push(this.finding([...this.events(run, run.members[0]!), { id: eventId, at, label }]));
      if (this.rule.steps[last]?.each !== true) {
        run.members.shift();
      }
    }
    if (!consumed) {
      findings.push(...this.start(eventId, at, facts, session));
    }
    this.open = this.open.filter((run) => run.members.length > 0);
    return findings;
  }

  private start(eventId: string, at: number, facts: EventFacts, session: Bindings): Finding[] {
    const first = this.rule.steps[0];
    const hit = first.match(facts, new Map(session));
    if (hit === null) {
      return [];
    }
    const own = [{ id: eventId, at, label: hit.label }];
    const done = first.repeat <= 1;
    if (done && this.rule.steps.length === 1) {
      return [this.finding(own)];
    }
    const member = { seq: this.started++, own, from: 0 };
    const next = done ? 1 : 0;
    const twin = next === 0 ? undefined : this.open.find((run) => this.joins(run, next, hit.bound, at));
    if (twin === undefined) {
      this.open.push({ next, count: done ? 0 : 1, bound: hit.bound, members: [member], shared: [] });
    } else {
      twin.members.push({ ...member, from: twin.shared.length });
    }
    return [];
  }

  private joins(run: Run, next: number, bound: Bindings, at: number): boolean {
    const youngest = run.members[run.members.length - 1];
    return (
      run.next === next &&
      run.count === 0 &&
      youngest !== undefined &&
      at >= youngest.own[0]!.at &&
      run.bound.size === bound.size &&
      [...bound].every(([name, value]) => run.bound.get(name) === value)
    );
  }

  /**
   * Drops the members that have outlived the window by `at`. A run still
   * repeating its first step slides instead: events that have left the window
   * drop out, and the ones still inside it keep counting.
   */
  private expire(run: Run, at: number): void {
    const window = this.rule.window;
    if (window === null) {
      return;
    }
    if (run.next !== 0) {
      while (run.members.length > 0 && !window.contains(run.members[0]!.own[0]!.at, at)) {
        run.members.shift();
      }
      return;
    }
    const member = run.members[0]!;
    const events = this.events(run, member);
    const first = events.findIndex((event) => window.contains(event.at, at));
    if (first < 0) {
      run.members = [];
    } else if (first > 0) {
      run.members = [{ seq: member.seq, own: events.slice(first), from: run.shared.length }];
      run.count = events.length - first;
    }
  }

  private events(run: Run, member: Member): MatchedEvent[] {
    return [...member.own, ...run.shared.slice(member.from)];
  }

  private finding(events: readonly MatchedEvent[]): Finding {
    const matched: string[] = [];
    for (const { label } of events) {
      if (label !== null && label !== matched[matched.length - 1]) {
        matched.push(label);
      }
    }
    return {
      ruleId: this.rule.id,
      ruleVersion: this.rule.version,
      ruleSetDigest: this.ruleSetDigest,
      severity: this.rule.severity,
      title: this.rule.title,
      explanation: this.rule.explanation,
      recommendation: this.rule.recommendation,
      eventIds: events.map((event) => event.id),
      matched,
    };
  }
}
