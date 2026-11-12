import type { Finding } from "../schema/Finding.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";
import { PlainWords } from "./PlainWords.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The report's account of what the agent did: the actions the safety check
 * stopped, then everything else that matched a rule, each linked to the
 * recorded actions behind it.
 */
export class ReportFindingsView {
  constructor(private readonly words: PlainWords = new PlainWords()) {}

  render(entries: readonly TimelineEntry[], findings: readonly Finding[]): string {
    return [this.skipped(entries, findings), this.findings(entries, this.needingALook(entries, findings))].filter((part) => part.length > 0).join("\n");
  }

  /** Findings about something that happened. One whose every action was skipped is already listed as skipped. */
  needingALook(entries: readonly TimelineEntry[], findings: readonly Finding[]): readonly Finding[] {
    const skipped = new Set(entries.filter((entry) => entry.blockedBy !== null).map((entry) => entry.eventId));
    return findings.filter((finding) => !finding.eventIds.every((eventId) => skipped.has(eventId)));
  }

  private skipped(entries: readonly TimelineEntry[], findings: readonly Finding[]): string {
    const skipped = entries.filter((entry) => entry.blockedBy !== null);
    if (skipped.length === 0) {
      return "";
    }
    const items = skipped
      .map((entry) => {
        const rule = entry.blockedBy ?? "";
        // A blockable rule matches one event and never tests the outcome, so it always flags the call it refused.
        const finding = findings.find((candidate) => candidate.ruleId === rule);
        const advice = finding === undefined ? null : this.words.advice(finding.recommendation);
        return `<li class="skipped-call" data-rule="${this.escape(rule)}">The agent tried to ${this.link(entry, true)}. Stopped because: <strong>${this.escape(finding?.title ?? rule)}</strong>.${
          advice === null ? "" : `\n<p class="todo">What to do: ${this.escape(advice.plain)}</p>`
        }
${this.more([`<p>When: ${this.escape(this.words.dateTime(entry.time))}.</p>`, finding === undefined ? "" : `<p>${this.escape(finding.explanation)}</p>`, this.developer(advice?.developer ?? null), `<p class="rule">Rule: ${this.escape(rule)}.</p>`])}</li>`;
      })
      .join("\n");
    const one = skipped.length === 1;
    return `<section class="skipped" id="skipped">
<h2>${skipped.length} skipped ${one ? "action" : "actions"}</h2>
<p>Stopped before ${one ? "it" : "they"} happened. The agent carried on without ${one ? "it" : "them"}.</p>
<ul>
${items}
</ul>
</section>`;
  }

  private findings(entries: readonly TimelineEntry[], findings: readonly Finding[]): string {
    const byId = new Map(entries.map((entry) => [entry.eventId, entry]));
    const items = findings
      .map((finding) => {
        const links = finding.eventIds.map((eventId) => {
          const entry = byId.get(eventId);
          return entry === undefined ? this.escape(eventId) : `${this.link(entry)}, at ${this.escape(this.words.dateTime(entry.time))}`;
        });
        const via = finding.matched.length === 0 ? "" : ` (${this.escape(finding.matched.join(", "))})`;
        const advice = this.words.advice(finding.recommendation);
        return `<li class="report-finding" data-rule="${this.escape(finding.ruleId)}"><strong>${this.escape(finding.title)}</strong> <span class="severity ${this.escape(finding.severity)}">${this.escape(this.words.severity(finding.severity))}</span>
<p class="todo">What to do: ${this.escape(advice.plain)}</p>
${this.more([`<p>${this.escape(finding.explanation)}</p>`, this.developer(advice.developer), `<p>What happened:</p><ul>${links.map((link) => `<li>${link}</li>`).join("")}</ul>`, `<p class="rule">Rule: ${this.escape(finding.ruleId)}${via}.</p>`])}</li>`;
      })
      .join("\n");
    // "In short" already says when nothing matched, so an empty section is left out.
    return findings.length === 0
      ? ""
      : `<section class="findings" id="findings">
<h2>What the agent did that needs a look: ${findings.length}</h2>
<ol>
${items}
</ol>
</section>`;
  }

  /** The detail a reader opens with "Explain more". Each part is a finished block; empty parts are dropped. */
  private more(parts: readonly string[]): string {
    return `<details><summary>Explain more</summary>${parts.filter((part) => part.length > 0).join("")}</details>`;
  }

  private developer(hint: string | null): string {
    return hint === null ? "" : `<p class="developer">For the developer: ${this.escape(hint)}</p>`;
  }

  private link(entry: TimelineEntry, tried = false): string {
    return `<a href="#event-${this.escape(entry.eventId)}">${this.escape(this.words.action(entry, tried))}</a>`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
