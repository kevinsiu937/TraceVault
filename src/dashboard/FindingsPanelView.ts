import type { SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * The session's findings above the cockpit grid: each names its rule, says
 * why it matters, and links every event behind it. Nothing renders when no
 * rule matched.
 */
export class FindingsPanelView implements SessionPaneView {
  readonly id = "findings";
  readonly label = "Findings";
  readonly slot = "top" as const;

  render(context: SessionRenderContext): string {
    if (context.findings.length === 0) {
      return "";
    }
    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const entries = new Map(context.allEntries.map((entry) => [entry.eventId, entry]));
    const items = context.findings
      .map((finding) => {
        const links = finding.eventIds
          .map((eventId) => {
            const entry = entries.get(eventId);
            const label = entry === undefined ? eventId : `${entry.time.slice(11, 19)} ${entry.type} ${entry.target}`;
            return `<a href="${this.escape(context.state.href(basePath, { event: eventId }))}">${this.escape(label)}</a>`;
          })
          .join(" ");
        return `<li class="finding" data-rule="${this.escape(finding.ruleId)}" data-severity="${this.escape(finding.severity)}">
<span class="severity ${this.escape(finding.severity)}">${this.escape(finding.severity)}</span>
<span class="flag" data-rule="${this.escape(finding.ruleId)}">⚑ ${this.escape(finding.ruleId)}</span>
<span class="finding-explanation">${this.escape(finding.explanation)}</span>
<span class="finding-recommendation">What to do: ${this.escape(finding.recommendation)}</span>${finding.matched.length === 0 ? "" : `\n<span class="finding-matched">via ${this.escape(finding.matched.join(", "))}</span>`}
<span class="finding-events">${links}</span>
</li>`;
      })
      .join("\n");
    const count = context.findings.length;

    return `<section class="findings" aria-label="Findings">
<h2 class="findings-title">${count} ${count === 1 ? "finding" : "findings"}</h2>
<ol class="findings-list">
${items}
</ol>
</section>`;
  }

  styles(): string {
    return `.findings{margin:0 0 12px;padding:10px 16px;border:1px solid color-mix(in srgb,var(--err) 45%,var(--line));border-radius:8px;background:color-mix(in srgb,var(--err) 6%,var(--panel))}
.findings-title{margin:0 0 6px;font-size:13px;font-weight:600;color:var(--err)}
.findings-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.finding{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:13px}
.finding .severity{font:600 11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-transform:uppercase;color:var(--muted)}
.finding .severity.high{color:var(--err)}
.finding-explanation{color:var(--text)}
.finding-recommendation{flex-basis:100%;color:var(--text)}
.finding-matched{color:var(--muted);font-size:12px}
.finding-events{display:flex;flex-wrap:wrap;gap:8px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`;
  }

  script(_context: SessionRenderContext): string {
    return "";
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
