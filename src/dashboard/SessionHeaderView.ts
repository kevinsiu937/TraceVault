import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export interface SessionHeaderRenderer {
  render(context: SessionRenderContext): string;
  styles(): string;
}

export class SessionHeaderView implements SessionHeaderRenderer {
  render(context: SessionRenderContext): string {
    const title = context.title.length > 0 ? context.title : context.sessionId;
    const started = context.summary.startedAt.length > 0
      ? context.summary.startedAt
      : context.allEntries[0]?.time ?? "";
    const errors = context.allEntries.filter((entry) => entry.outcome === "error").length;
    const denied = context.allEntries.filter((entry) => entry.outcome === "denied").length;
    const parentId = context.summary.parentSessionId;
    const parent = typeof parentId === "string" && parentId.length > 0
      ? `<a class="parent-link" href="/sessions/${encodeURIComponent(parentId)}">↑ Parent session</a>`
      : "";

    return `<header class="cockpit-head">
<div class="head-main">
<a class="back" href="/">← All sessions</a>${parent}
<h1>${this.escape(title)}</h1>
<p class="head-sub"><code>${this.escape(context.sessionId)}</code> · ${this.escape(context.summary.agentName)} · started <time datetime="${this.escape(started)}">${this.escape(this.wallClock(started))}</time> · ${this.totalDuration(context.allEntries)}</p>
<ul class="stats">
<li><span class="stat-value">${context.allEntries.length}</span> <span class="stat-label">${context.allEntries.length === 1 ? "event" : "events"}</span></li>
<li><span class="stat-value">${errors}</span> <span class="stat-label">${errors === 1 ? "error" : "errors"}</span></li>
<li><span class="stat-value">${denied}</span> <span class="stat-label">denied</span></li>
</ul>
</div>
<nav class="session-steps" aria-label="Sessions">
${this.step("Previous", "prev", context.previousSessionId, "← Previous")}
${this.step("Next", "next", context.nextSessionId, "Next →")}
</nav>
</header>`;
  }

  styles(): string {
    return `.cockpit-head{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:2px 2px 18px}
.cockpit-head .back{margin:0 0 10px}
.cockpit-head .parent-link{display:inline-block;margin:0 0 10px 12px;font-size:13px;color:var(--accent)}
.cockpit-head .parent-link:hover{text-decoration:underline}
.cockpit-head h1{font-size:26px;line-height:1.2;letter-spacing:-.02em;font-weight:600;margin:0 0 6px}
.head-sub{color:var(--muted);font-size:13px;margin:0}
.head-sub code{font-size:12px}
.stats{display:flex;gap:22px;list-style:none;margin:14px 0 0;padding:0}
.stats li{display:flex;align-items:baseline;gap:6px}
.stat-value{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.stat-label{color:var(--muted);font-size:12px;letter-spacing:.04em;text-transform:uppercase}
.session-steps{display:flex;align-items:center;gap:8px;flex-shrink:0}
.step{display:inline-flex;align-items:center;min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--text);font-size:13px;white-space:nowrap}
.step:hover{border-color:var(--accent);color:var(--accent);text-decoration:none}
.step.disabled{color:var(--muted);opacity:.5}
@media (max-width:640px){
.cockpit-head{flex-direction:column;align-items:stretch;gap:12px}
.session-steps{justify-content:space-between}
.cockpit-head h1{font-size:21px;overflow-wrap:anywhere}
}`;
  }

  private step(
    label: string,
    rel: "prev" | "next",
    sessionId: string | null,
    text: string,
  ): string {
    if (sessionId === null) {
      return `<span class="step disabled" aria-disabled="true">${text}</span>`;
    }
    return `<a class="step" rel="${rel}" href="/sessions/${encodeURIComponent(sessionId)}" aria-label="${this.escape(label)} session">${text}</a>`;
  }

  private totalDuration(entries: readonly TimelineEntry[]): string {
    if (entries.length < 2) {
      return "0s";
    }
    const first = Date.parse(entries[0]?.time ?? "");
    const last = Date.parse(entries[entries.length - 1]?.time ?? "");
    if (Number.isNaN(first) || Number.isNaN(last)) {
      return "—";
    }
    const milliseconds = Math.max(0, last - first);
    if (milliseconds < 1000) {
      return `${Math.round(milliseconds)}ms`;
    }
    if (milliseconds < 60000) {
      return milliseconds % 1000 === 0 ? `${milliseconds / 1000}s` : `${(milliseconds / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.round((milliseconds % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  private wallClock(time: string): string {
    return time.length >= 19 ? time.slice(11, 19) : time || "—";
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
