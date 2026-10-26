import { ActivityFilter } from "../service/ActivityFilter.js";
import { FilterExpression } from "../service/FilterExpression.js";

const MAX_TEXT = 200;
const MAX_EXPRESSION = 400;

export class FilterParams {
  private readonly expressions = new FilterExpression();

  parse(url: URL): ActivityFilter {
    return new ActivityFilter(
      this.values(url, "kind"),
      this.values(url, "outcome"),
      this.values(url, "operation"),
      (url.searchParams.get("q") ?? "").trim().slice(0, MAX_TEXT),
      this.expressions.parse(this.expression(url)),
    );
  }

  href(path: string, filter: ActivityFilter): string {
    const query = this.query(filter);
    return query.length > 0 ? `${path}?${query}` : path;
  }

  query(filter: ActivityFilter): string {
    const params = new URLSearchParams();
    if (filter.kinds.length > 0) {
      params.set("kind", filter.kinds.join(","));
    }
    if (filter.outcomes.length > 0) {
      params.set("outcome", filter.outcomes.join(","));
    }
    if (filter.operations.length > 0) {
      params.set("operation", filter.operations.join(","));
    }
    if (filter.text.length > 0) {
      params.set("q", filter.text);
    }
    if (filter.expression.text.length > 0) {
      params.set("expr", filter.expression.text);
    }
    return params.toString();
  }

  /** Repeated `expr` params and space-separated fragments are one expression. */
  private expression(url: URL): string {
    return url.searchParams
      .getAll("expr")
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .join(" ")
      .slice(0, MAX_EXPRESSION);
  }

  private values(url: URL, name: string): string[] {
    const values = url.searchParams
      .getAll(name)
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    return [...new Set(values)];
  }
}
