import { ActivityFilter } from "../service/ActivityFilter.js";
import type { SessionActivity } from "../service/SessionActivity.js";
import { DashboardStyle } from "./DashboardStyle.js";
import { FilterBar } from "./FilterBar.js";
import { FilterParams } from "./FilterParams.js";
import { TimelineRow } from "./TimelineRow.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class ActivityView {
  private readonly params = new FilterParams();

  constructor(
    private readonly style: DashboardStyle = new DashboardStyle(),
    private readonly filterBar: FilterBar = new FilterBar(),
    private readonly row: TimelineRow = new TimelineRow(),
  ) {}

  render(groups: readonly SessionActivity[], filter: ActivityFilter): string {
    const total = groups.reduce((count, group) => count + group.entries.length, 0);
    const summary = `${total} matching ${total === 1 ? "event" : "events"}`;
    const body =
      groups.length === 0
        ? `<div class="card empty">No events match this filter. <a href="/activity">Clear filters</a></div>`
        : groups.map((group) => this.group(group)).join("\n");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${this.style.render()}
<title>TraceVault — Activity</title>
</head>
<body>
<main>
<a class="back" href="/">← All sessions</a>
<header class="top">
<div>
<h1>Activity</h1>
<p class="sub">Across all sessions · newest first</p>
</div>
</header>
${this.filterBar.render("/activity", filter, { kinds: [], presets: true })}
<p class="result-count" role="status">${summary}</p>
${body}
</main>
</body>
</html>
`;
  }

  private group(group: SessionActivity): string {
    const title = group.title.length > 0 ? group.title : group.sessionId;
    return `<section class="group" data-session-id="${this.escape(group.sessionId)}">
<header class="group-head">
<div><a href="/sessions/${encodeURIComponent(group.sessionId)}">${this.escape(title)}</a><div class="muted mono">${this.escape(group.sessionId)}</div></div>
<div class="muted">${this.escape(group.agentName)} · ${group.entries.length} matching</div>
</header>
<ol class="timeline" aria-label="Timeline for ${this.escape(group.sessionId)}">
${group.entries.map((entry) => this.row.render(entry)).join("\n")}
</ol>
</section>`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
