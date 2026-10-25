import type { TimelineEntry } from "../service/TimelineEntry.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class TimelineRow {
  render(entry: TimelineEntry): string {
    return `<li class="event" data-event-id="${this.escape(entry.eventId)}" data-time="${this.escape(entry.time)}" data-kind="${this.escape(entry.type)}" data-outcome="${this.escape(entry.outcome)}">
<details class="event-details">
<summary class="event-row">
<time class="event-time mono" datetime="${this.escape(entry.time)}" title="${this.escape(entry.time)}">${this.escape(this.shortTime(entry.time))}</time>
<span class="marker" data-kind="${this.escape(entry.type)}" aria-hidden="true"></span>
<span class="event-main"><span class="kind-label">${this.escape(entry.type)}</span><span class="target mono">${this.escape(this.displayTarget(entry))}</span></span>
<span class="event-side"><span class="pill ${this.escape(entry.outcome)}">${this.escape(entry.outcome)}</span><span class="chevron" aria-hidden="true"></span></span>
</summary>
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

  private shortTime(time: string): string {
    return time.length >= 19 ? time.slice(11, 19) : time;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
