import type { EventQuery } from "../store/EventQuery.js";
import { NO_EXPRESSION, type ParsedExpression } from "./FilterExpression.js";
import type { TimeWindow } from "./TimeWindow.js";

export class ActivityFilter {
  static readonly none = new ActivityFilter([], [], [], "", NO_EXPRESSION, null);

  constructor(
    readonly kinds: readonly string[],
    readonly outcomes: readonly string[],
    readonly operations: readonly string[],
    readonly text: string,
    readonly expression: ParsedExpression = NO_EXPRESSION,
    readonly window: TimeWindow | null = null,
  ) {}

  get active(): boolean {
    return (
      this.kinds.length > 0 ||
      this.outcomes.length > 0 ||
      this.operations.length > 0 ||
      this.text.length > 0 ||
      this.expression.text.length > 0 ||
      this.window !== null
    );
  }

  with(
    change: Partial<Pick<ActivityFilter, "kinds" | "outcomes" | "operations" | "text" | "expression" | "window">>,
  ): ActivityFilter {
    return new ActivityFilter(
      change.kinds ?? this.kinds,
      change.outcomes ?? this.outcomes,
      change.operations ?? this.operations,
      change.text ?? this.text,
      change.expression ?? this.expression,
      change.window === undefined ? this.window : change.window,
    );
  }

  withoutExpression(): ActivityFilter {
    return this.with({ expression: NO_EXPRESSION });
  }

  withoutWindow(): ActivityFilter {
    return this.with({ window: null });
  }

  toggle(field: "kinds" | "outcomes" | "operations", value: string): ActivityFilter {
    const current = this[field];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    return this.with({ [field]: next });
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
      ...(this.window === null ? {} : { range: { from: this.window.from, to: this.window.to } }),
    };
  }
}
