import type { RowHeader } from "./RowHeader.js";
import { HtmlText } from "./HtmlText.js";

const PROMPT_ROW_LIMIT = 200;

/** Draws the cells of a one-line row header: time, marker, kind and target, flags, duration, pills. */
export class RowHeaderView {
  render(header: RowHeader): string {
    const count = header.count === null ? "" : `<span class="repeat-count">${header.count} ×</span> `;
    const flags = header.flags
      .map((ruleId) => `<span class="flag" data-rule="${HtmlText.escape(ruleId)}" title="Flagged by rule ${HtmlText.escape(ruleId)}">⚑ ${HtmlText.escape(ruleId)}</span>`)
      .join("");
    const pills = header.pills
      .map((pill) => `<span class="pill ${HtmlText.escape(pill.outcome)}">${HtmlText.escape(pill.label)}</span>`)
      .join("");
    return `<time class="event-time mono" datetime="${HtmlText.escape(header.time)}" title="${HtmlText.escape(header.time)}">${HtmlText.escape(this.shortTime(header.time))}</time>
<span class="marker" data-kind="${HtmlText.escape(header.kind)}" aria-hidden="true"></span>
<span class="event-main"><span class="kind-label">${HtmlText.escape(header.kind)}</span><span class="target mono">${count}${HtmlText.escape(this.displayTarget(header))}</span></span>
<span class="event-side">${flags}<span class="mono">${HtmlText.escape(this.duration(header.durationMs))}</span>${pills}<span class="chevron" aria-hidden="true"></span></span>`;
  }

  styles(): string {
    return `.flag{display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border:1px solid var(--err);border-radius:999px;color:var(--err);font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap}`;
  }

  private duration(milliseconds: number | null): string {
    if (milliseconds === null) {
      return "—";
    }
    return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
  }

  private displayTarget(header: RowHeader): string {
    if (header.kind === "prompt.user") {
      return header.target.length <= PROMPT_ROW_LIMIT ? header.target : `${header.target.slice(0, PROMPT_ROW_LIMIT - 1)}…`;
    }
    if (header.kind !== "document.access") {
      return header.target;
    }
    const parts = header.target.split(/[\\/]+/).filter((part) => part.length > 0);
    return parts.slice(-2).join("/");
  }

  private shortTime(time: string): string {
    return time.length >= 19 ? time.slice(11, 19) : time;
  }
}
