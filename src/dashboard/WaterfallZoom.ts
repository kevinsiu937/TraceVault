import type { SessionRenderContext } from "./SessionRenderContext.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Zooming the waterfall. Dragging across the plot turns the selection into
 * `from`/`to` in the URL and the server re-renders, so the list and the
 * waterfall share one filter. A press without movement stays a click on the
 * bar underneath. The toolbar says what is zoomed and how to undo it.
 */
export class WaterfallZoom {
  toolbar(context: SessionRenderContext, basePath: string): string {
    const range = context.filter.window;
    if (range === null) {
      return '<div class="wf-toolbar"><span class="wf-hint">Drag across the plot to zoom into a time range.</span></div>';
    }
    const reset = context.state.href(basePath, { view: "waterfall", from: null, to: null });
    const label = `${this.wallClock(range.from)}–${this.wallClock(range.to)}`;
    return `<div class="wf-toolbar"><span class="wf-range">Zoomed to <time datetime="${this.escape(range.from)}">${this.escape(label)}</time></span><a class="wf-reset" href="${this.escape(reset)}">Reset zoom</a></div>`;
  }

  /** Attributes the plot carries so the script can turn pixels into time. */
  plotAttributes(t0: number, span: number): string {
    return `data-t0="${t0}" data-span="${span}"`;
  }

  brush(): string {
    return '<div class="wf-brush" hidden></div>';
  }

  styles(): string {
    return `.wf-toolbar{display:flex;align-items:baseline;gap:12px;margin:0 0 8px;font-size:12px;color:var(--muted)}
.wf-range{font-variant-numeric:tabular-nums;color:var(--text)}
.wf-range time{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.wf-reset{color:var(--accent)}
.wf-plot{cursor:crosshair;user-select:none;-webkit-user-select:none;touch-action:pan-y}
.wf-brush{position:absolute;top:0;bottom:0;z-index:2;pointer-events:none;background:color-mix(in srgb,var(--accent) 18%,transparent);border-left:1px solid var(--accent);border-right:1px solid var(--accent)}
.wf-brush[hidden]{display:none}`;
  }

  script(): string {
    return `(() => {
  const plot = document.querySelector(".wf-plot");
  if (plot === null) return;
  const t0 = Number(plot.dataset.t0);
  const span = Number(plot.dataset.span);
  const brush = plot.querySelector(".wf-brush");
  let start = null;
  let dragged = false;
  const at = (x) => {
    const box = plot.getBoundingClientRect();
    return Math.min(1, Math.max(0, (x - box.left) / box.width));
  };
  const instant = (fraction) => new Date(Math.round(t0 + span * fraction)).toISOString();
  plot.addEventListener("dragstart", (event) => event.preventDefault());
  plot.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    start = at(event.clientX);
    dragged = false;
  });
  plot.addEventListener("pointermove", (event) => {
    if (start === null) return;
    const now = at(event.clientX);
    if (!dragged) {
      if (Math.abs(now - start) * plot.getBoundingClientRect().width < 4) return;
      dragged = true;
      plot.setPointerCapture(event.pointerId);
    }
    brush.hidden = false;
    brush.style.left = Math.min(start, now) * 100 + "%";
    brush.style.width = Math.abs(now - start) * 100 + "%";
  });
  plot.addEventListener("pointerup", (event) => {
    if (start === null) return;
    const begin = start;
    const end = at(event.clientX);
    start = null;
    if (!dragged) return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "waterfall");
    url.searchParams.set("from", instant(Math.min(begin, end)));
    url.searchParams.set("to", instant(Math.max(begin, end)));
    window.location.assign(url.toString());
  });
  plot.addEventListener("pointercancel", () => {
    start = null;
    dragged = false;
    brush.hidden = true;
  });
  plot.addEventListener("click", (event) => {
    if (!dragged) return;
    event.preventDefault();
    dragged = false;
  }, true);
})();`;
  }

  private wallClock(time: string): string {
    return time.slice(11, 19);
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
