import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { ReplayTurnState } from "./ReplayTimeline.js";
import type { RowHeader } from "./RowHeader.js";
import { RowHeaderView } from "./RowHeaderView.js";
import { HtmlText } from "./HtmlText.js";

export interface TimelineRowOptions {
  readonly href?: string;
  readonly selected?: boolean;
  readonly replay?: ReplayTurnState;
}

export class TimelineRow {
  constructor(private readonly headerView: RowHeaderView = new RowHeaderView()) {}

  render(entry: TimelineEntry, options: TimelineRowOptions = {}): string {
    const selected = options.selected === true;
    const replay =
      options.replay === "past" || options.replay === "active" ? ` is-${options.replay}` : "";
    const marker = selected ? ' aria-current="true"' : "";
    const row = this.headerView.render(this.header(entry));
    const head = options.href === undefined
      ? `<summary class="event-row"${marker}>${row}</summary>`
      : `<a class="event-row${selected ? " selected" : ""}" href="${HtmlText.escape(options.href)}"${marker}>${row}</a>`;

    const parent = entry.parentEventId === null ? "" : ` data-parent="${HtmlText.escape(entry.parentEventId)}"`;
    return `<li class="event${replay}${parent === "" ? "" : " nested"}" data-event-id="${HtmlText.escape(entry.eventId)}"${parent} data-time="${HtmlText.escape(entry.time)}" data-kind="${HtmlText.escape(entry.type)}" data-outcome="${HtmlText.escape(entry.outcome)}" id="event-${HtmlText.escape(entry.eventId)}">
${head}
<details class="event-details event-raw">
<summary class="raw-summary" aria-label="Show stored event JSON">raw</summary>
<div class="event-detail"><pre>${HtmlText.escape(entry.detail)}</pre></div>
</details>
</li>`;
  }

  styles(): string {
    return `${this.headerView.styles()}
.event.nested .event-row{padding-left:32px}`;
  }

  private header(entry: TimelineEntry): RowHeader {
    return {
      time: entry.time,
      kind: entry.type,
      target: entry.target,
      count: null,
      durationMs: entry.durationMs,
      pills: [{ outcome: entry.outcome, label: entry.outcome }],
      flags: entry.flags,
    };
  }
}
