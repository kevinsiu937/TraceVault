import { ActivityFilter } from "../service/ActivityFilter.js";
import { FilterParams } from "./FilterParams.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export interface KindCount {
  readonly kind: string;
  readonly count: number;
}

export interface FilterBarOptions {
  readonly kinds: readonly KindCount[];
  readonly presets: boolean;
  readonly presetBase?: string;
}

export class FilterBar {
  constructor(private readonly params: FilterParams = new FilterParams()) {}

  render(basePath: string, filter: ActivityFilter, options: FilterBarOptions): string {
    const legend =
      options.kinds.length === 0
        ? ""
        : `<div class="legend" role="list" aria-label="Kinds in this session">${options.kinds
            .map((item) =>
              this.chip(
                item.kind,
                this.params.href(basePath, filter.toggle("kinds", item.kind)),
                filter.kinds.includes(item.kind),
                item.count,
              ),
            )
            .join("")}</div>`;

    const outcomes = ["ok", "error", "denied"]
      .map((outcome) =>
        this.chip(
          outcome,
          this.params.href(basePath, filter.toggle("outcomes", outcome)),
          filter.outcomes.includes(outcome),
        ),
      )
      .join("");

    const presets = options.presets ? this.presets(filter, options.presetBase ?? "/activity") : "";
    const hidden = [
      ...filter.kinds.map((kind) => this.hidden("kind", kind)),
      ...filter.outcomes.map((outcome) => this.hidden("outcome", outcome)),
      ...filter.operations.map((operation) => this.hidden("operation", operation)),
    ].join("");
    const clear = filter.active
      ? `<a class="chip clear" href="${this.escape(this.params.href(basePath, ActivityFilter.none))}">Clear</a>`
      : "";
    const expressionChip =
      filter.expression.text.length > 0
        ? `<div class="chips expression-chip"><a class="chip active expression" href="${this.escape(this.params.href(basePath, filter.withoutExpression()))}" aria-label="Clear expression">${this.escape(filter.expression.text)} <span aria-hidden="true">×</span></a></div>`
        : "";

    return `<nav class="filters" aria-label="Filters">
${legend}
<div class="chips" role="group" aria-label="Filter by outcome">${outcomes}</div>
${presets}
<form class="search" method="get" action="${this.escape(basePath)}" role="search">
${hidden}<input type="search" name="expr" value="${this.escape(filter.expression.text)}" placeholder="kind:mcp path~session" list="expression-suggestions" aria-label="Filter expression">
<datalist id="expression-suggestions">
<option value="kind:mcp"></option>
<option value="outcome:error"></option>
<option value="duration:>500"></option>
<option value="path~"></option>
</datalist>
<input type="search" name="q" value="${this.escape(filter.text)}" placeholder="Filter targets…" aria-label="Filter targets">
<button type="submit">Filter</button>
${clear}
</form>
${expressionChip}
</nav>`;
  }

  private presets(filter: ActivityFilter, base: string): string {
    const documents = new ActivityFilter(["document.access"], [], ["write"], "");
    const skills = new ActivityFilter(["skill.call"], [], [], "");
    const failures = new ActivityFilter([], ["error"], [], "");
    return `<div class="chips presets" role="group" aria-label="Saved views">
${this.chip("Documents modified", this.params.href(base, documents), this.same(filter, documents))}
${this.chip("Skills used", this.params.href(base, skills), this.same(filter, skills))}
${this.chip("Failed", this.params.href(base, failures), this.same(filter, failures))}
</div>`;
  }

  private same(left: ActivityFilter, right: ActivityFilter): boolean {
    return (
      left.kinds.join(",") === right.kinds.join(",") &&
      left.outcomes.join(",") === right.outcomes.join(",") &&
      left.operations.join(",") === right.operations.join(",") &&
      left.text === right.text
    );
  }

  private chip(label: string, href: string, active: boolean, count?: number): string {
    const shownCount = count === undefined ? "" : ` <span class="legend-count">${count}</span>`;
    return `<a class="chip${active ? " active" : ""}" href="${this.escape(href)}"${active ? ' aria-current="true"' : ""}>${this.escape(label)}${shownCount}</a>`;
  }

  private hidden(name: string, value: string): string {
    return `<input type="hidden" name="${this.escape(name)}" value="${this.escape(value)}">`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
