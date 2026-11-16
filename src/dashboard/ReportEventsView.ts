import type { TimelineEntry } from "../service/TimelineEntry.js";
import { PlainWords } from "./PlainWords.js";
import { HtmlText } from "./HtmlText.js";

const MISSING_EVIDENCE = new Set(["capture.gap", "guard.failure"]);

/** The report's full record: every action grouped by kind, then every gap in the record. */
export class ReportEventsView {
  constructor(private readonly words: PlainWords = new PlainWords()) {}

  /** `titles` turns a rule id into its plain title, for the "Flagged as" column. */
  render(entries: readonly TimelineEntry[], titles: ReadonlyMap<string, string>): string {
    return `${this.events(entries, titles)}\n${this.gaps(entries)}`;
  }

  private events(entries: readonly TimelineEntry[], titles: ReadonlyMap<string, string>): string {
    const groups = new Map<string, TimelineEntry[]>();
    for (const entry of entries) {
      groups.set(entry.type, [...(groups.get(entry.type) ?? []), entry]);
    }
    const sections = [...groups]
      .map(
        ([type, group]) => `<section class="event-group" data-type="${HtmlText.escape(type)}">
<h3>${HtmlText.escape(this.words.kind(type))} · ${group.length}</h3>
<table><thead><tr><th>Time</th><th>What happened</th><th>Result</th><th>Flagged as</th></tr></thead><tbody>
${group.map((entry) => this.row(entry, titles)).join("\n")}
</tbody></table>
</section>`,
      )
      .join("\n");
    return `<section class="events" id="events">
<h2>Everything that happened</h2>
${sections.length === 0 ? "<p>No actions were recorded.</p>" : `<details><summary>Show all ${entries.length} recorded ${entries.length === 1 ? "action" : "actions"}, by kind</summary>\n${sections}\n</details>`}
</section>`;
  }

  private row(entry: TimelineEntry, titles: ReadonlyMap<string, string>): string {
    const flags = entry.flags.map((rule) => titles.get(rule) ?? rule).join("; ");
    return `<tr id="event-${HtmlText.escape(entry.eventId)}"><td class="time"><time datetime="${HtmlText.escape(entry.time)}">${HtmlText.escape(this.words.clock(entry.time))}</time></td><td class="target">${HtmlText.escape(this.words.action(entry))}</td><td class="outcome ${HtmlText.escape(entry.outcome)}">${HtmlText.escape(this.words.result(entry.outcome))}</td><td>${HtmlText.escape(flags)}</td></tr>`;
  }

  private gaps(entries: readonly TimelineEntry[]): string {
    const missing = entries.filter((entry) => MISSING_EVIDENCE.has(entry.type));
    if (missing.length === 0) {
      return "";
    }
    const items = missing
      .map((entry) => {
        const text =
          entry.type === "capture.gap"
            ? `Recording stopped from ${this.when(entry.gapFrom ?? entry.time)} to ${this.when(entry.gapTo ?? entry.time)}. Actions in that time may be missing. Reason: ${HtmlText.escape(entry.target)}`
            : `At ${this.when(entry.time)} the safety check failed, and one action went ahead without being checked. Reason: ${HtmlText.escape(entry.target)}`;
        return `<li>${text} <a href="#event-${HtmlText.escape(entry.eventId)}">(see the record)</a></li>`;
      })
      .join("\n");
    return `<section class="gaps" id="gaps">
<h2>Gaps in the record</h2>
<p>The record is incomplete here, so this report cannot speak for these times.</p>
<ul>
${items}
</ul>
</section>`;
  }

  private when(iso: string): string {
    return `<time datetime="${HtmlText.escape(iso)}">${HtmlText.escape(this.words.dateTime(iso))}</time>`;
  }
}
