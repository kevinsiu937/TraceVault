import type { SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

/**
 * A quiet placeholder for the left slot. The file lens (ticket 19) replaces
 * this pane; the shell only knows the slot.
 */
export class SessionRailView implements SessionPaneView {
  readonly id = "files";
  readonly label = "Files";
  readonly slot = "left" as const;

  render(_context: SessionRenderContext): string {
    return `<h2 class="pane-title">Files</h2>
<p class="pane-empty">No files tracked in this view yet.</p>`;
  }

  styles(): string {
    return `.rail .pane-title{margin-bottom:10px}
.rail .pane-empty{color:var(--muted);font-size:12.5px;line-height:1.55;margin:0}`;
  }

  script(): string {
    return "";
  }
}
