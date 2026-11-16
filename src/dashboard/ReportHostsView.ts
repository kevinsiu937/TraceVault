import type { TimelineEntry } from "../service/TimelineEntry.js";
import { PlainWords } from "./PlainWords.js";
import { HtmlText } from "./HtmlText.js";

/**
 * The report's "Hosts contacted": each host and port the shell connected to,
 * once, in the order first contacted, with how many connections went there and
 * the call that made the first. Empty when the shell made no connection.
 */
export class ReportHostsView {
  constructor(private readonly words: PlainWords = new PlainWords()) {}

  render(entries: readonly TimelineEntry[]): string {
    const hosts = new Map<string, TimelineEntry[]>();
    for (const entry of entries.filter((candidate) => candidate.type === "net.connect")) {
      hosts.set(entry.target, [...(hosts.get(entry.target) ?? []), entry]);
    }
    if (hosts.size === 0) {
      return "";
    }
    const byId = new Map(entries.map((entry) => [entry.eventId, entry]));
    const items = [...hosts]
      .map(([host, connections]) => {
        const first = connections[0] as TimelineEntry;
        const call = first.parentEventId === null ? undefined : byId.get(first.parentEventId);
        const by =
          call === undefined
            ? `a command TraceVault could not name <a href="#event-${HtmlText.escape(first.eventId)}">(see the record)</a>`
            : `<a href="#event-${HtmlText.escape(call.eventId)}">${HtmlText.escape(this.words.action(call))}</a>`;
        const count = `${connections.length} ${connections.length === 1 ? "connection" : "connections"}`;
        return `<li><code>${HtmlText.escape(host)}</code> · ${count} · first by ${by}</li>`;
      })
      .join("\n");
    return `<section class="hosts" id="hosts">
<h2>Hosts contacted: ${hosts.size}</h2>
<p>Where the agent's commands connected. Only the place is recorded, never what was sent.</p>
<ul>
${items}
</ul>
</section>`;
  }
}
