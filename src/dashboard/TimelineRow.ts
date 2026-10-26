import type { TimelineEntry } from "../service/TimelineEntry.js";

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
}

export class TimelineRow {
  render(entry: TimelineEntry, options: TimelineRowOptions = {}): string {
    const selected = options.selected === true;
    const marker = selected ? ' aria-current="true"' : "";
    const row = `<time class="event-time mono" datetime="${this.escape(entry.time)}" title="${this.escape(entry.time)}">${this.escape(this.shortTime(entry.time))}</time>
<span class="marker" data-kind="${this.escape(entry.type)}" aria-hidden="true"></span>
<span class="event-main"><span class="kind-label">${this.escape(entry.type)}</span><span class="target mono">${this.escape(this.displayTarget(entry))}</span></span>
<span class="event-side"><span class="mono">${this.escape(this.duration(entry.durationMs))}</span><span class="pill ${this.escape(entry.outcome)}">${this.escape(entry.outcome)}</span><span class="chevron" aria-hidden="true"></span></span>`;
    const head = options.href === undefined
      ? `<summary class="event-row"${marker}>${row}</summary>`
      : `<a class="event-row${selected ? " selected" : ""}" href="${this.escape(options.href)}"${marker}>${row}</a>`;

    return `<li class="event" data-event-id="${this.escape(entry.eventId)}" data-time="${this.escape(entry.time)}" data-kind="${this.escape(entry.type)}" data-outcome="${this.escape(entry.outcome)}" id="event-${this.escape(entry.eventId)}">
${head}
<details class="event-details event-raw">
<summary class="raw-summary" aria-label="Show stored event JSON">raw</summary>
<div class="event-detail"><pre>${this.escape(entry.detail)}</pre></div>
</details>
</li>`;
  }

  private displayTarget(entry: TimelineEntry): string {
    if (entry.type !== "document.access") {
      return entry.target;
    }
    const parts = entry.target.split(/[\\/]+/).filter((part) => part.length > 0);
    return parts.slice(-2).join("/");
  }

  private duration(milliseconds: number | null): string {
    if (milliseconds === null) {
      return "—";
    }
    return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
  }

  private shortTime(time: string): string {
    return time.length >= 19 ? time.slice(11, 19) : time;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
