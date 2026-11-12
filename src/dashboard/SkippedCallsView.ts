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
 * The calls the opt-in guard skipped, above the findings: what the agent did
 * not do, the rule that stopped it, and what to do about it. Nothing renders
 * when the guard skipped nothing.
 */
export class SkippedCallsView implements SessionPaneView {
  readonly id = "skipped";
  readonly label = "Skipped calls";
  readonly slot = "top" as const;

  render(context: SessionRenderContext): string {
    const skipped = context.allEntries.filter((entry) => entry.blockedBy !== null);
    if (skipped.length === 0) {
      return "";
    }
    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const items = skipped
      .map((entry) => {
        const rule = entry.blockedBy ?? "";
        // A blockable rule matches one event and never tests the outcome, so it always flags the call it refused.
        const recommendation = context.findings.find((finding) => finding.ruleId === rule)?.recommendation;
        const call = [entry.time.slice(11, 19), entry.type, entry.operation, entry.target].filter((part) => part !== null && part.length > 0).join(" ");
        return `<li class="skipped-call" data-rule="${this.escape(rule)}">
<a href="${this.escape(context.state.href(basePath, { event: entry.eventId }))}">${this.escape(call)}</a>
<span class="skipped-rule">skipped by ${this.escape(rule)}</span>${recommendation === undefined ? "" : `\n<span class="skipped-recommendation">What to do: ${this.escape(recommendation)}</span>`}
</li>`;
      })
      .join("\n");

    return `<section class="skipped" aria-label="Skipped calls">
<h2 class="skipped-title">${skipped.length} skipped ${skipped.length === 1 ? "call" : "calls"}: the agent was told not to run ${skipped.length === 1 ? "this" : "these"}</h2>
<ol class="skipped-list">
${items}
</ol>
</section>`;
  }

  styles(): string {
    return `.skipped{margin:0 0 12px;padding:10px 16px;border:1px solid color-mix(in srgb,var(--warn) 45%,var(--line));border-radius:8px;background:var(--panel)}
.skipped-title{margin:0 0 6px;font-size:13px;font-weight:600}
.skipped-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.skipped-call{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:13px}
.skipped-call a{font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.skipped-rule{color:var(--muted);font-size:12px}
.skipped-recommendation{flex-basis:100%}`;
  }

  script(_context: SessionRenderContext): string {
    return "";
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
