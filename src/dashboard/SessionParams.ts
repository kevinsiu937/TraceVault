const DEFAULT_VIEW = "list";
const PARAM_KEYS = ["view", "event", "q", "from", "to", "t"] as const;

export type SessionParamKey = (typeof PARAM_KEYS)[number];

function clean(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The session URL, parsed once per request. Later tickets read these fields and
 * build links through href(); nothing else edits them.
 */
export class SessionParams {
  private constructor(
    private readonly query: URLSearchParams,
    readonly view: string,
    readonly event: string | null,
    readonly q: string,
    readonly from: string | null,
    readonly to: string | null,
    readonly t: string | null,
  ) {}

  static parse(url: URL): SessionParams {
    const query = new URLSearchParams(url.searchParams);
    return new SessionParams(
      query,
      clean(query.get("view")) ?? DEFAULT_VIEW,
      clean(query.get("event")),
      (query.get("q") ?? "").trim(),
      clean(query.get("from")),
      clean(query.get("to")),
      clean(query.get("t")),
    );
  }

  href(base: string, patch: Partial<Record<SessionParamKey, string | null>>): string {
    const query = new URLSearchParams(this.query);
    for (const [key, value] of Object.entries(patch) as [SessionParamKey, string | null | undefined][]) {
      if (value === undefined || value === null || value.length === 0) {
        query.delete(key);
      } else {
        query.set(key, value);
      }
    }
    // Keep a view the caller asked for explicitly (the graph links to the list);
    // only strip the default that came in on the incoming URL.
    if (patch.view === undefined && query.get("view") === DEFAULT_VIEW) {
      query.delete("view");
    }
    const search = query.toString();
    return search.length > 0 ? `${base}?${search}` : base;
  }
}
