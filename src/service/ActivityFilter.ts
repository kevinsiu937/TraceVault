import type { EventQuery } from "../store/EventQuery.js";
import type { TimelineEntry } from "./TimelineEntry.js";

export class ActivityFilter {
  static readonly none = new ActivityFilter([], [], [], "");

  constructor(
    readonly kinds: readonly string[],
    readonly outcomes: readonly string[],
    readonly operations: readonly string[],
    readonly text: string,
  ) {}

  get active(): boolean {
    return (
      this.kinds.length > 0 ||
      this.outcomes.length > 0 ||
      this.operations.length > 0 ||
      this.text.length > 0
    );
  }

  with(change: Partial<Pick<ActivityFilter, "kinds" | "outcomes" | "operations" | "text">>): ActivityFilter {
    return new ActivityFilter(
      change.kinds ?? this.kinds,
      change.outcomes ?? this.outcomes,
      change.operations ?? this.operations,
      change.text ?? this.text,
    );
  }

  toggle(field: "kinds" | "outcomes" | "operations", value: string): ActivityFilter {
    const current = this[field];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    return this.with({ [field]: next });
  }

  matches(entry: TimelineEntry): boolean {
    if (this.kinds.length > 0 && !this.kinds.includes(entry.type)) {
      return false;
    }
    if (this.outcomes.length > 0 && !this.outcomes.includes(entry.outcome)) {
      return false;
    }
    if (
      this.operations.length > 0 &&
      (entry.operation === null || !this.operations.includes(entry.operation))
    ) {
      return false;
    }
    if (this.text.length > 0 && !entry.target.toLowerCase().includes(this.text.toLowerCase())) {
      return false;
    }
    return true;
  }

  toQuery(sessionId: string | null): EventQuery {
    return {
      sessionId,
      kinds: this.kinds,
      outcomes: this.outcomes,
      operations: this.operations,
      text: this.text,
    };
  }
}
