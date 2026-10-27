import { ActivityFilter } from "../service/ActivityFilter.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";
import { TurnBuilder } from "../service/TurnBuilder.js";
import { FilterBar } from "./FilterBar.js";
import { FilterParams } from "./FilterParams.js";
import { ReplayTimeline } from "./ReplayTimeline.js";
import type { SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";
import { TimelineRow } from "./TimelineRow.js";
import { TurnDivider } from "./TurnDivider.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** The centre List pane of the cockpit. */
export class TimelineView implements SessionPaneView {
  readonly id = "list";
  readonly label = "Timeline";
  readonly slot = "center" as const;
  private readonly params = new FilterParams();

  constructor(
    private readonly filterBar: FilterBar = new FilterBar(),
    private readonly row: TimelineRow = new TimelineRow(),
    private readonly turnBuilder: TurnBuilder = new TurnBuilder(),
    private readonly divider: TurnDivider = new TurnDivider(),
  ) {}

  render(context: SessionRenderContext): string {
    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const counts = this.counts(context.allEntries);
    const summary = context.filter.active
      ? `${context.entries.length} of ${context.allEntries.length} events`
      : `${context.entries.length} events`;
    const empty = `<div class="card empty">No events match this filter. <a href="${this.escape(this.params.href(basePath, ActivityFilter.none))}">Clear filters</a></div>`;
    const turns = ReplayTimeline.from(context, this.turnBuilder).turns;
    const rows = context.entries.length === 0
      ? ""
      : turns
          .map(({ turn, state }) =>
            [
              this.divider.render(turn, state),
              ...turn.entries.map((entry) =>
                this.row.render(entry, {
                  href: context.state.href(basePath, { event: entry.eventId }),
                  selected: context.state.event === entry.eventId,
                  replay: state,
                }),
              ),
            ].join("\n"),
          )
          .join("\n");

    return `<p class="result-count" role="status">${summary} · newest at the bottom</p>
${this.filterBar.render(basePath, context.filter, { kinds: counts, presets: true, presetBase: basePath })}
${context.entries.length === 0 ? empty : ""}
<ol class="timeline" id="timeline" aria-label="Session timeline">
${rows}
</ol>`;
  }

  styles(): string {
    return `.center .timeline{border-radius:0}
.center .event{border-bottom:1px solid var(--line)}
.center .event:last-child{border-bottom:none}
.center .event-row{color:inherit;text-decoration:none;margin:0}
.center .event-row:hover{text-decoration:none}
.center .event-row.selected{background:color-mix(in srgb,var(--accent) 10%,transparent)}
.center .event-row:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.center .event-raw{border-bottom:none;background:transparent}
.center .event-raw>summary{display:flex;align-items:center;min-height:22px;padding:0 20px 6px 136px;color:var(--muted);font-size:10px;letter-spacing:.06em;text-transform:uppercase;opacity:.6;cursor:pointer;list-style:none}
.center .event-raw>summary::-webkit-details-marker{display:none}
.center .event-raw>summary:hover{color:var(--text)}
.center .event-raw[open]{background:var(--panel-2)}
.center .event:target{animation:tv-flash 1.1s ease-out 1}
@keyframes tv-flash{from{background:color-mix(in srgb,var(--accent) 20%,transparent)}to{background:transparent}}
.center .event.is-past,.center .turn-divider.is-past{opacity:.35;transition:opacity .25s ease}
.center .event.is-active,.center .turn-divider.is-active{opacity:1}
@media (prefers-reduced-motion:reduce){
  .center .event.is-past,.center .turn-divider.is-past{transition:none}
  .center .event:target{animation:none;background:color-mix(in srgb,var(--accent) 12%,transparent)}
}
.center .turn-divider{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:6px 0 0;padding:8px 20px;background:var(--panel-2);border-left:3px inset var(--line);color:var(--muted);font-size:11px;list-style:none}
.center .turn-divider:first-child{margin-top:0}
.center .turn-prompt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.center .turn-meta{flex:none;white-space:nowrap}
.center .turn-divider.has-errors{border-left-color:var(--err);color:var(--err)}
.center .turn-divider.has-errors .turn-prompt{color:var(--err)}
.center .turn-divider.has-denied{border-left-color:var(--warn);color:var(--warn)}
.center .turn-divider.has-denied .turn-prompt{color:var(--warn)}
.center .event-main{white-space:nowrap}
.center .event-main>*{max-width:100%;overflow:hidden;text-overflow:ellipsis}
.center .target{white-space:nowrap;overflow-wrap:normal;overflow:hidden;text-overflow:ellipsis;max-width:100%}
@media (max-width:640px){
  .center .event-raw>summary{padding-left:44px;padding-right:14px}
}`;
  }

  script(context: SessionRenderContext): string {
    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const query = this.params.query(context.filter);
    const streamUrl = `${basePath}/events${query.length > 0 ? `?${query}` : ""}`;
    return `const streamUrl = ${JSON.stringify(streamUrl)};
const timeline = document.getElementById("timeline");
const source = new EventSource(streamUrl);
source.onmessage = (message) => {
  const entry = JSON.parse(message.data);
  if (timeline === null || timeline.querySelector('[data-event-id="' + entry.eventId + '"]') !== null) return;
  const template = document.createElement("template");
  template.innerHTML = entry.html;
  const row = template.content.firstElementChild;
  if (row === null) return;
  const firstVisible = [...timeline.children].findIndex((existing) => existing.getBoundingClientRect().bottom > 0);
  const events = [...timeline.querySelectorAll(":scope > li.event")];
  const index = Math.max(0, Math.min(entry.position, events.length));
  timeline.insertBefore(row, events[index] ?? null);
  if (firstVisible >= 0 && index < firstVisible) {
    window.scrollBy(0, row.getBoundingClientRect().height);
  }
  const empty = document.querySelector(".empty");
  if (empty !== null) empty.remove();
};`;
  }

  renderEntry(entry: TimelineEntry): string {
    return this.row.render(entry, { href: `?event=${encodeURIComponent(entry.eventId)}` });
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
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
