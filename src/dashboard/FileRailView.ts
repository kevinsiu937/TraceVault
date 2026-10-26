import { FileRailIndex } from "./FileRailIndex.js";
import type { FileTouch, FileTouchGroup } from "./FileRailIndex.js";
import type { SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const REF_LIMIT = 8;

/**
 * The cockpit's left slot: which files the session touched, busiest first.
 * It follows the active filter, so a filtered view never lists a file whose
 * events are hidden from the centre pane.
 */
export class FileRailView implements SessionPaneView {
  readonly id = "files";
  readonly label = "Files";
  readonly slot = "left" as const;

  constructor(private readonly index: FileRailIndex = new FileRailIndex()) {}

  render(context: SessionRenderContext): string {
    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const groups = this.index.build(context.entries);
    const body = groups.length === 0
      ? '<p class="pane-empty">No files touched in this session.</p>'
      : `<div class="file-list">${groups
          .map((group) => this.group(group, basePath, context))
          .join("\n")}</div>`;

    return `<h2 class="pane-title">Files · ${groups.length}</h2>
${body}`;
  }

  styles(): string {
    return `.rail .pane-title{margin-bottom:10px}
.file-list{display:flex;flex-direction:column;gap:4px;min-width:0}
.file-group{min-width:0}
.file-group>summary{display:flex;align-items:center;gap:6px;min-height:32px;padding:4px 6px;border-radius:8px;cursor:pointer;list-style:none;font-size:12.5px;transition:background .12s}
.file-group>summary::-webkit-details-marker{display:none}
.file-group>summary::before{content:"▸";flex:none;color:var(--muted);font-size:10px;transition:transform .12s}
.file-group[open]>summary::before{transform:rotate(90deg)}
.file-group>summary:hover{background:var(--panel-2)}
.file-group>summary:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.file-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12.5px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.file-count{flex:none;padding:1px 6px;border:1px solid var(--line);border-radius:999px;background:var(--panel-2);color:var(--muted);font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.file-refs{display:flex;flex-direction:column;padding:2px 0 6px 16px;min-width:0}
.file-ref{display:flex;align-items:baseline;gap:8px;min-width:0;min-height:24px;padding:1px 4px;border-radius:6px;color:var(--text);font-size:12px;text-decoration:none}
.file-ref:hover{background:var(--panel-2);text-decoration:none}
.file-ref:focus-visible{outline:2px solid var(--accent);outline-offset:-2px}
.file-ref-time{flex:none;color:var(--muted);font:11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}
.file-ref-op{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file-ref.op-read{color:var(--muted)}
.file-ref.op-write .file-ref-op{color:var(--kind-document);font-weight:600}
.file-ref.op-delete .file-ref-op{color:var(--err);font-weight:600}
.file-ref.op-rename .file-ref-op{color:var(--warn);font-weight:600}
.file-more{padding:1px 4px;color:var(--muted);font-size:11.5px}
.rail .pane-empty{color:var(--muted);font-size:12.5px;line-height:1.55;margin:0}
@media (max-width:640px){
.file-list{flex:1}
}
@media (prefers-reduced-motion:reduce){
.file-group>summary,.file-group>summary::before{transition:none}
}`;
  }

  script(_context: SessionRenderContext): string {
    return "";
  }

  private group(group: FileTouchGroup, basePath: string, context: SessionRenderContext): string {
    const shown = group.refs.slice(0, REF_LIMIT);
    const hidden = group.count - shown.length;
    const refs = shown.map((touch) => this.ref(touch, basePath, context)).join("\n");
    const more = hidden > 0 ? `\n<span class="file-more">+${hidden} more</span>` : "";

    return `<details class="file-group">
<summary title="${this.escape(group.path)}"><span class="file-path">${this.escape(this.shortPath(group.path))}</span><span class="file-count">${group.count}</span></summary>
<div class="file-refs">
${refs}${more}
</div>
</details>`;
  }

  private ref(touch: FileTouch, basePath: string, context: SessionRenderContext): string {
    const href = `${context.state.href(basePath, { view: "list", event: touch.eventId })}#event-${touch.eventId}`;
    const operation = touch.operation.length > 0 ? touch.operation : "access";

    return `<a class="file-ref op-${this.escape(operation)}" href="${this.escape(href)}"><span class="file-ref-time">${this.escape(this.wallClock(touch.time))}</span><span class="file-ref-op">${this.escape(operation)}</span></a>`;
  }

  /** The rail is 230px wide, so it names a file by its last two segments. */
  private shortPath(path: string): string {
    const segments = path.split(/[\\/]/).filter((segment) => segment.length > 0);
    return segments.slice(-2).join("/") || path;
  }

  private wallClock(time: string): string {
    const parsed = Date.parse(time);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(11, 19) : time;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
