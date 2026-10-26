import type { EventQuery } from "../store/EventQuery.js";
import { NO_EXPRESSION, type ParsedExpression } from "./FilterExpression.js";
import type { TimelineEntry } from "./TimelineEntry.js";

export class ActivityFilter {
  static readonly none = new ActivityFilter([], [], [], "", NO_EXPRESSION);

  constructor(
    readonly kinds: readonly string[],
    readonly outcomes: readonly string[],
    readonly operations: readonly string[],
    readonly text: string,
    readonly expression: ParsedExpression = NO_EXPRESSION,
  ) {}

  get active(): boolean {
    return (
      this.kinds.length > 0 ||
      this.outcomes.length > 0 ||
      this.operations.length > 0 ||
      this.text.length > 0 ||
      this.expression.text.length > 0
    );
  }

  with(
    change: Partial<Pick<ActivityFilter, "kinds" | "outcomes" | "operations" | "text" | "expression">>,
  ): ActivityFilter {
    return new ActivityFilter(
      change.kinds ?? this.kinds,
      change.outcomes ?? this.outcomes,
      change.operations ?? this.operations,
      change.text ?? this.text,
      change.expression ?? this.expression,
    );
  }

  withoutExpression(): ActivityFilter {
    return this.with({ expression: NO_EXPRESSION });
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
    return this.expressionMatches(entry);
  }

  toQuery(sessionId: string | null): EventQuery {
    return {
      sessionId,
      kinds: this.kinds,
      outcomes: this.outcomes,
      operations: this.operations,
      text: this.text,
      expression: {
        kinds: this.expression.kinds,
        outcomes: this.expression.outcomes,
        targetTerms: [...this.expression.targetTerms, ...this.expression.pathTerms],
        words: this.expression.words,
        durations: this.expression.durations,
      },
    };
  }

  private expressionMatches(entry: TimelineEntry): boolean {
    const expression = this.expression;
    const type = entry.type.toLowerCase();
    const target = entry.target.toLowerCase();

    if (
      expression.kinds.length > 0 &&
      !expression.kinds.some(
        (kind) => entry.type === kind || type.startsWith(`${kind.toLowerCase()}.`),
      )
    ) {
      return false;
    }
    if (expression.outcomes.length > 0 && !expression.outcomes.includes(entry.outcome)) {
      return false;
    }
    for (const term of [...expression.targetTerms, ...expression.pathTerms]) {
      if (!target.includes(term.toLowerCase())) {
        return false;
      }
    }
    for (const word of expression.words) {
      const needle = word.toLowerCase();
      if (!target.includes(needle) && !type.includes(needle)) {
        return false;
      }
    }
    for (const duration of expression.durations) {
      if (entry.durationMs === null) {
        return false;
      }
      if (duration.operator === ">" && !(entry.durationMs > duration.milliseconds)) {
        return false;
      }
      if (duration.operator === ">=" && !(entry.durationMs >= duration.milliseconds)) {
        return false;
      }
      if (duration.operator === "<" && !(entry.durationMs < duration.milliseconds)) {
        return false;
      }
    }
    return true;
  }
}
