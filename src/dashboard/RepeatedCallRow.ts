import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { ReplayTurnState } from "./ReplayTimeline.js";
import { TimelineRow, type RowPill } from "./TimelineRow.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Outcomes that must lead the header so a failure inside a run is never hidden. */
const SEVERITY = ["error", "denied"] as const;

export interface RepeatedCallRowOptions {
  readonly href: (entry: TimelineEntry) => string;
  readonly selectedEventId: string | null;
  readonly replay?: ReplayTurnState;
}

/**
 * One "N × command" row for a run of identical calls. The header is a native
 * <details> summary; expanding it shows every call as an ordinary row, so no
 * event leaves the page — it only moves under the run.
 */
export class RepeatedCallRow {
  constructor(private readonly row: TimelineRow = new TimelineRow()) {}

  render(entries: readonly TimelineEntry[], options: RepeatedCallRowOptions): string {
    const first = entries[0];
    if (first === undefined) {
      return "";
    }
    const open = entries.some((entry) => entry.eventId === options.selectedEventId);
    const replay =
      options.replay === "past" || options.replay === "active" ? ` is-${options.replay}` : "";
    const header = this.row.cells(first, {
      count: entries.length,
      duration: this.row.durationLabel(this.total(entries)),
      pills: this.pills(entries),
    });
    const members = entries
      .map((entry) =>
        this.row.render(entry, {
          href: options.href(entry),
          selected: entry.eventId === options.selectedEventId,
          ...(options.replay === undefined ? {} : { replay: options.replay }),
        }),
      )
      .join("\n");

    return `<li class="event-group${replay}" data-kind="${this.escape(first.type)}" data-outcome="${this.escape(this.headline(entries))}" data-count="${entries.length}">
<details class="repeat"${open ? " open" : ""}>
<summary class="event-row repeat-row">${header}</summary>
<ol class="repeat-members">
${members}
</ol>
</details>
</li>`;
  }

  /** A uniform run shows its one outcome; a mixed run counts each, worst first. */
  private pills(entries: readonly TimelineEntry[]): RowPill[] {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.outcome, (counts.get(entry.outcome) ?? 0) + 1);
    }
    if (counts.size === 1) {
      const outcome = entries[0]?.outcome ?? "";
      return [{ outcome, label: outcome }];
    }
    const ordered = [
      ...SEVERITY.filter((outcome) => counts.has(outcome)),
      ...[...counts.keys()].filter((outcome) => !(SEVERITY as readonly string[]).includes(outcome)),
    ];
    return ordered.map((outcome) => ({ outcome, label: `${counts.get(outcome) ?? 0} ${outcome}` }));
  }

  private headline(entries: readonly TimelineEntry[]): string {
    const worst = SEVERITY.find((outcome) => entries.some((entry) => entry.outcome === outcome));
    return worst ?? entries[0]?.outcome ?? "";
  }

  private total(entries: readonly TimelineEntry[]): number | null {
    const known = entries.filter((entry) => entry.durationMs !== null);
    return known.length === 0 ? null : known.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0);
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
