import { KindRunAggregator } from "./KindRunAggregator.js";
import type { KindRunNode } from "./KindRunAggregator.js";
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
 * The centre Graph pane: the session as runs of one kind, in execution order.
 * Presentation only — the shell decides when it renders.
 */
export class GraphView implements SessionPaneView {
  readonly id = "graph";
  readonly label = "Graph";
  readonly slot = "center" as const;

  constructor(private readonly aggregator: KindRunAggregator = new KindRunAggregator()) {}

  render(context: SessionRenderContext): string {
    const nodes = this.aggregator.aggregate(context.entries);
    if (nodes.length === 0) {
      return '<div class="graph" id="graph"><p class="graph-empty" role="status">No events to graph in this session.</p></div>';
    }

    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    let offset = 0;
    const steps = nodes.map((node, index) => {
      const selected = context.entries
        .slice(offset, offset + node.count)
        .some((entry) => entry.eventId === context.state.event);
      offset += node.count;
      return this.step(node, index === nodes.length - 1, selected, basePath, context);
    });

    return `<div class="graph" id="graph">
<ol class="graph-chain" aria-label="Event kind runs">
${steps.join("\n")}
</ol>
</div>`;
  }

  styles(): string {
    return `.graph{min-width:0}
.graph-chain{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;align-items:stretch;max-width:720px}
.graph-step{min-width:0}
.graph-node{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 12px;min-width:0;min-height:44px;padding:9px 12px;border:1px solid var(--line);border-left:3px solid var(--node-color,var(--muted));border-radius:12px;background:var(--panel-2);color:var(--text);text-decoration:none;transition:background .12s,border-color .12s}
.graph-node:hover{background:var(--panel);text-decoration:none}
.graph-node:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.graph-node[aria-current="true"]{border-color:var(--accent);background:var(--accent-bg)}
.graph-node-kind{display:flex;align-items:center;gap:8px;min-width:0;font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.graph-dot{flex:none;width:8px;height:8px;border-radius:999px;background:var(--node-color,var(--muted))}
.graph-node-meta{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px;min-width:0;font:11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);font-variant-numeric:tabular-nums}
.graph-count{color:var(--text);font-weight:600}
.graph-errors{color:var(--err);font-weight:600}
.graph-time{color:var(--muted)}
.graph-edge{display:block;width:14px;height:20px;margin:2px auto;color:var(--line)}
.graph-edge line,.graph-edge polyline{stroke:currentColor;stroke-width:1.5;fill:none}
.graph-edge-error{color:var(--err)}
.graph-empty{color:var(--muted);font-size:13.5px;margin:0;line-height:1.55}
.graph-node[data-kind="hook.script"]{--node-color:var(--kind-hook)}
.graph-node[data-kind="document.access"]{--node-color:var(--kind-document)}
.graph-node[data-kind="mcp.call"]{--node-color:var(--kind-mcp)}
.graph-node[data-kind="skill.call"]{--node-color:var(--kind-skill)}
.graph-node[data-kind="session.start"],.graph-node[data-kind="session.end"]{--node-color:var(--kind-session)}
.graph-node[data-kind="capture.gap"]{--node-color:var(--kind-gap)}
@media (prefers-reduced-motion:reduce){
.graph-node{transition:none}
}`;
  }

  script(_context: SessionRenderContext): string {
    return "";
  }

  private step(
    node: KindRunNode,
    last: boolean,
    selected: boolean,
    basePath: string,
    context: SessionRenderContext,
  ): string {
    const href = `${context.state.href(basePath, { view: "list", event: node.firstEventId })}#event-${node.firstEventId}`;
    const errors = node.errorCount > 0
      ? `<span class="graph-errors">${node.errorCount} error${node.errorCount === 1 ? "" : "s"}</span>`
      : "";
    const edge = last
      ? ""
      : `\n<svg class="graph-edge${node.errorCount > 0 ? " graph-edge-error" : ""}" width="14" height="20" viewBox="0 0 14 20" aria-hidden="true" focusable="false"><line x1="7" y1="1" x2="7" y2="13"></line><polyline points="3,10 7,14 11,10"></polyline></svg>`;

    return `<li class="graph-step">
<a class="graph-node" data-kind="${this.escape(node.kind)}" data-count="${node.count}" data-errors="${node.errorCount}" href="${this.escape(href)}"${selected ? ' aria-current="true"' : ""}><span class="graph-node-kind"><span class="graph-dot" aria-hidden="true"></span>${this.escape(node.kind)}</span><span class="graph-node-meta"><span class="graph-count">×${node.count}</span>${errors}<time class="graph-time" datetime="${this.escape(node.firstTime)}">${this.escape(this.wallClock(node.firstTime))}</time></span></a>${edge}
</li>`;
  }

  private wallClock(time: string): string {
    return time.length >= 19 ? time.slice(11, 19) : time;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
