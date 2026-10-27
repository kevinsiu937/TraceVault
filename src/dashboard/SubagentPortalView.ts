import type { SessionSummary } from "../service/SessionSummary.js";
import type { SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

type SubagentStatus = "open" | "ended" | "uncovered";

/**
 * The cockpit's top slot: the subagents this session spawned, above the
 * timeline. A root with no children renders nothing, so the shell keeps its
 * 230px/1fr/330px grid.
 */
export class SubagentPortalView implements SessionPaneView {
  readonly id = "subagents";
  readonly label = "Subagents";
  readonly slot = "top" as const;

  render(context: SessionRenderContext): string {
    const children = context.sessions
      .filter((session) => session.parentSessionId === context.sessionId)
      .sort(
        (left, right) =>
          left.startedAt.localeCompare(right.startedAt) || left.sessionId.localeCompare(right.sessionId),
      );
    if (children.length === 0) {
      return "";
    }

    return `<div class="subagents" id="subagents">
<h2 class="pane-title">Subagents · ${children.length}</h2>
<ul class="subagent-list">
${children.map((child) => this.card(child)).join("\n")}
</ul>
</div>`;
  }

  styles(): string {
    return `.subagents{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:16px}
.subagents .pane-title{margin:0 0 12px}
.subagent-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.subagent-card{display:flex;flex-direction:column;gap:8px;min-width:0;min-height:44px;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel-2);color:var(--text);text-decoration:none;transition:background .12s,border-color .12s}
.subagent-card:hover{background:var(--panel);border-color:var(--accent);text-decoration:none}
.subagent-card:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.subagent-title{font-size:13.5px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.subagent-meta{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;color:var(--muted);font:11.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.subagent-errors.has-errors{color:var(--err);font-weight:600}
.subagent-status{border-radius:999px;padding:1px 8px;background:var(--gap-bg);color:var(--gap);font-weight:600;text-transform:capitalize}
.subagent-status.open{background:var(--accent-bg);color:var(--accent)}
.subagent-status.ended{background:var(--ok-bg);color:var(--ok)}
.subagent-status.uncovered{background:var(--warn-bg);color:var(--warn)}
@media (prefers-reduced-motion:reduce){
.subagent-card{transition:none}
}`;
  }

  script(_context: SessionRenderContext): string {
    return "";
  }

  private card(child: SessionSummary): string {
    const title = child.title.length > 0 ? child.title : child.sessionId;
    const status = this.status(child);
    const errors = child.errorCount > 0 ? " has-errors" : "";

    return `<li><a class="subagent-card" href="/sessions/${encodeURIComponent(child.sessionId)}">
<span class="subagent-title">${this.escape(title)}</span>
<span class="subagent-meta"><span>${this.escape(child.agentName)}</span><span>${child.eventCount} ${child.eventCount === 1 ? "event" : "events"}</span><span class="subagent-errors${errors}">${child.errorCount} ${child.errorCount === 1 ? "error" : "errors"}</span><span>${this.duration(child.durationMs)}</span><span class="subagent-status ${status}">${status}</span></span>
</a></li>`;
  }

  private status(child: SessionSummary): SubagentStatus {
    if (child.gapCount > 0) {
      return "uncovered";
    }
    return child.endedAt === null ? "open" : "ended";
  }

  private duration(ms: number | null): string {
    if (ms === null) {
      return "—";
    }
    const seconds = Math.round(ms / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
