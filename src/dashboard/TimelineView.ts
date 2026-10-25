import { ActivityFilter } from "../service/ActivityFilter.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";
import { DashboardStyle } from "./DashboardStyle.js";
import { FilterBar } from "./FilterBar.js";
import { FilterParams } from "./FilterParams.js";
import { TimelineRow } from "./TimelineRow.js";

export class TimelineView {
  private readonly params = new FilterParams();

  constructor(
    private readonly style: DashboardStyle = new DashboardStyle(),
    private readonly filterBar: FilterBar = new FilterBar(),
    private readonly row: TimelineRow = new TimelineRow(),
  ) {}

  render(
    sessionId: string,
    entries: readonly TimelineEntry[],
    allEntries: readonly TimelineEntry[],
    filter: ActivityFilter,
    streamUrl: string,
    title = "",
  ): string {
    const basePath = `/sessions/${encodeURIComponent(sessionId)}`;
    const counts = this.counts(allEntries);
    const summary = filter.active
      ? `${entries.length} of ${allEntries.length} events`
      : `${entries.length} events`;
    const empty = `<div class="card empty">No events match this filter. <a href="${this.escape(this.params.href(basePath, ActivityFilter.none))}">Clear filters</a></div>`;
    const rows = entries.map((entry) => this.row.render(entry)).join("\n");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${this.style.render()}
<title>TraceVault — ${this.escape(sessionId)}</title>
</head>
<body>
<main>
<a class="back" href="/">← All sessions</a>
<a class="back" href="/activity">Activity across sessions →</a>
<header class="top">
<div>
<h1>${title.length > 0 ? this.escape(title) : `<code>${this.escape(sessionId)}</code>`}</h1>
<p class="sub" role="status"><span class="mono">${this.escape(sessionId)}</span> · ${summary} · newest at the bottom</p>
</div>
</header>
${this.filterBar.render(basePath, filter, { kinds: counts, presets: true, presetBase: basePath })}
${entries.length === 0 ? empty : ""}
<ol class="timeline" id="timeline" aria-label="Session timeline">
${rows}
</ol>
</main>
<script>
const streamUrl = ${JSON.stringify(streamUrl)};
const timeline = document.getElementById("timeline");
const source = new EventSource(streamUrl);
source.onmessage = (message) => {
  const entry = JSON.parse(message.data);
  if (timeline === null || timeline.querySelector('[data-event-id="' + entry.eventId + '"]') !== null) return;
  const template = document.createElement("template");
  template.innerHTML = entry.html;
  const row = template.content.firstElementChild;
  if (row === null) return;
  const next = [...timeline.children].find((existing) => (existing.dataset.time || "") > entry.time);
  timeline.insertBefore(row, next ?? null);
  const empty = document.querySelector(".empty");
  if (empty !== null) empty.remove();
};
</script>
</body>
</html>
`;
  }

  renderEntry(entry: TimelineEntry): string {
    return this.row.render(entry);
  }

  private counts(entries: readonly TimelineEntry[]): { kind: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind));
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const escapes: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return escapes[character] ?? character;
    });
  }
}
