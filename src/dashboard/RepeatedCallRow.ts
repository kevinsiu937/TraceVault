import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { RepeatedRun } from "./RepeatedCallGrouper.js";
import type { ReplayTurnState } from "./ReplayTimeline.js";
import type { RowHeader, RowPill } from "./RowHeader.js";
import { RowHeaderView } from "./RowHeaderView.js";
import { TimelineRow } from "./TimelineRow.js";

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
  constructor(
    private readonly row: TimelineRow = new TimelineRow(),
    private readonly headerView: RowHeaderView = new RowHeaderView(),
  ) {}

  render(run: RepeatedRun, options: RepeatedCallRowOptions): string {
    const [first] = run;
    const open = run.some((entry) => entry.eventId === options.selectedEventId);
    const replay =
      options.replay === "past" || options.replay === "active" ? ` is-${options.replay}` : "";
    const members = run
      .map((entry) =>
        this.row.render(entry, {
          href: options.href(entry),
          selected: entry.eventId === options.selectedEventId,
          ...(options.replay === undefined ? {} : { replay: options.replay }),
        }),
      )
      .join("\n");

    return `<li class="event-group${replay}" data-kind="${this.escape(first.type)}" data-outcome="${this.escape(this.headline(run))}" data-count="${run.length}">
<details class="repeat"${open ? " open" : ""}>
<summary class="event-row repeat-row">${this.headerView.render(this.header(run))}</summary>
<ol class="repeat-members">
${members}
</ol>
</details>
</li>`;
  }

  private header(run: RepeatedRun): RowHeader {
    const [first] = run;
    return {
      time: first.time,
      kind: first.type,
      target: first.target,
      count: run.length,
      durationMs: this.total(run),
      pills: this.pills(run),
      flags: [...new Set(run.flatMap((entry) => entry.flags))],
    };
  }

  /** A uniform run shows its one outcome; a mixed run counts each, worst first. */
  private pills(run: RepeatedRun): RowPill[] {
    const counts = new Map<string, number>();
    for (const entry of run) {
      counts.set(entry.outcome, (counts.get(entry.outcome) ?? 0) + 1);
    }
    if (counts.size === 1) {
      return [{ outcome: run[0].outcome, label: run[0].outcome }];
    }
    const ordered = [
      ...SEVERITY.filter((outcome) => counts.has(outcome)),
      ...[...counts.keys()].filter((outcome) => !(SEVERITY as readonly string[]).includes(outcome)),
    ];
    return ordered.map((outcome) => ({ outcome, label: `${counts.get(outcome) ?? 0} ${outcome}` }));
  }

  private headline(run: RepeatedRun): string {
    const worst = SEVERITY.find((outcome) => run.some((entry) => entry.outcome === outcome));
    return worst ?? run[0].outcome;
  }

  private total(run: RepeatedRun): number | null {
    const known = run.filter((entry) => entry.durationMs !== null);
    return known.length === 0 ? null : known.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0);
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
