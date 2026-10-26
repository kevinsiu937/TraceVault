import type { SessionRenderContext } from "./SessionRenderContext.js";

/**
 * A pane that lives in one of the cockpit's extension slots. Later views
 * (waterfall, graph, file rail, replay) add a file and implement this, without
 * the shell naming them.
 */
export interface SessionPane {
  readonly id: string;
  readonly label: string;
  render(context: SessionRenderContext): string;
  styles(): string;
  script(context: SessionRenderContext): string;
}

export interface SessionPaneView extends SessionPane {
  readonly slot: "left" | "center" | "bottom";
}
