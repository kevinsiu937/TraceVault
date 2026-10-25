import { ActivityFilter } from "../service/ActivityFilter.js";

const MAX_TEXT = 200;

export class FilterParams {
  parse(url: URL): ActivityFilter {
    return new ActivityFilter(
      this.values(url, "kind"),
      this.values(url, "outcome"),
      this.values(url, "operation"),
      (url.searchParams.get("q") ?? "").trim().slice(0, MAX_TEXT),
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
    return params.toString();
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
