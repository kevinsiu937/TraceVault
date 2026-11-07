import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { ReplayTurnState } from "./ReplayTimeline.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export interface TimelineRowOptions {
  readonly href?: string;
  readonly selected?: boolean;
  readonly replay?: ReplayTurnState;
}

export interface RowPill {
  readonly outcome: string;
  readonly label: string;
}

/** What a repeated run overrides in the shared one-line header. */
export interface RowSide {
  readonly count?: number;
  readonly duration?: string;
  readonly pills?: readonly RowPill[];
}

export class TimelineRow {
  render(entry: TimelineEntry, options: TimelineRowOptions = {}): string {
    const selected = options.selected === true;
    const replay =
      options.replay === "past" || options.replay === "active" ? ` is-${options.replay}` : "";
    const marker = selected ? ' aria-current="true"' : "";
    const row = this.cells(entry);
    const head = options.href === undefined
      ? `<summary class="event-row"${marker}>${row}</summary>`
      : `<a class="event-row${selected ? " selected" : ""}" href="${this.escape(options.href)}"${marker}>${row}</a>`;

    return `<li class="event${replay}" data-event-id="${this.escape(entry.eventId)}" data-time="${this.escape(entry.time)}" data-kind="${this.escape(entry.type)}" data-outcome="${this.escape(entry.outcome)}" id="event-${this.escape(entry.eventId)}">
${head}
<details class="event-details event-raw">
<summary class="raw-summary" aria-label="Show stored event JSON">raw</summary>
<div class="event-detail"><pre>${this.escape(entry.detail)}</pre></div>
</details>
</li>`;
  }

  /** The one-line header cells. A repeated run reuses them with its own count, duration and pills. */
  cells(entry: TimelineEntry, side: RowSide = {}): string {
    const count = side.count === undefined ? "" : `<span class="repeat-count">${side.count} ×</span> `;
    const duration = side.duration ?? this.durationLabel(entry.durationMs);
    const pills = (side.pills ?? [{ outcome: entry.outcome, label: entry.outcome }])
      .map((pill) => `<span class="pill ${this.escape(pill.outcome)}">${this.escape(pill.label)}</span>`)
      .join("");
    return `<time class="event-time mono" datetime="${this.escape(entry.time)}" title="${this.escape(entry.time)}">${this.escape(this.shortTime(entry.time))}</time>
<span class="marker" data-kind="${this.escape(entry.type)}" aria-hidden="true"></span>
<span class="event-main"><span class="kind-label">${this.escape(entry.type)}</span><span class="target mono">${count}${this.escape(this.displayTarget(entry))}</span></span>
<span class="event-side"><span class="mono">${this.escape(duration)}</span>${pills}<span class="chevron" aria-hidden="true"></span></span>`;
  }

  durationLabel(milliseconds: number | null): string {
    if (milliseconds === null) {
      return "—";
    }
    return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
  }

  private displayTarget(entry: TimelineEntry): string {
    if (entry.type !== "document.access") {
      return entry.target;
    }
    const parts = entry.target.split(/[\\/]+/).filter((part) => part.length > 0);
    return parts.slice(-2).join("/");
  }

  private shortTime(time: string): string {
    return time.length >= 19 ? time.slice(11, 19) : time;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
