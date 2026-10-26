import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { SessionPane } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export class DetailPaneView implements SessionPane {
  readonly id = "detail";
  readonly label = "Event detail";

  render(context: SessionRenderContext): string {
    const selected = this.selected(context);
    const heading = '<h2 class="pane-title">Event detail</h2>';
    if (selected === null) {
      return `${heading}<p class="pane-empty" role="status">Select an event to inspect its stored JSON.</p>`;
    }

    const duration = selected.durationMs === null
      ? ""
      : `<div><dt>Duration</dt><dd class="mono">${this.duration(selected.durationMs)}</dd></div>`;

    return `${heading}
<dl class="detail-list">
<div><dt>Event id</dt><dd class="mono detail-target">${this.escape(selected.eventId)}</dd></div>
<div><dt>Kind</dt><dd class="mono">${this.escape(selected.type)}</dd></div>
<div><dt>Target</dt><dd class="mono detail-target">${this.escape(selected.target)}</dd></div>
<div><dt>Outcome</dt><dd><span class="pill ${this.escape(selected.outcome)}">${this.escape(selected.outcome)}</span></dd></div>
${duration}
<div><dt>Time</dt><dd class="mono">${this.escape(this.wallClock(selected.time))}</dd></div>
</dl>
<details class="detail-json">
<summary>JSON</summary>
<pre>${this.escape(selected.detail)}</pre>
</details>`;
  }

  styles(): string {
    return `.pane-title{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 12px}
.pane-empty{color:var(--muted);font-size:13.5px;margin:0;line-height:1.55}
.detail-list{display:grid;gap:11px;margin:0 0 16px}
.detail-list>div{display:grid;grid-template-columns:68px minmax(0,1fr);gap:8px;align-items:baseline}
.detail-list dt{color:var(--muted);font-size:11.5px;letter-spacing:.04em;text-transform:uppercase}
.detail-list dd{margin:0;min-width:0;font-size:13px}
.detail-target{overflow-wrap:anywhere}
.detail-json{border-top:1px solid var(--line);padding-top:10px}
.detail-json>summary{display:flex;align-items:center;min-height:40px;cursor:pointer;color:var(--muted);font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.detail-json>summary:hover{color:var(--text)}
.detail-json pre{margin:8px 0 0;max-height:52vh;overflow:auto;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--text);font:11.5px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}
.detail-json pre:focus-visible{outline:2px solid var(--accent);outline-offset:1px}`;
  }

  script(): string {
    return "";
  }

  private selected(context: SessionRenderContext): TimelineEntry | null {
    const eventId = context.state.event;
    if (eventId === null) {
      return null;
    }
    return context.allEntries.find((entry) => entry.eventId === eventId) ?? null;
  }

  private duration(milliseconds: number): string {
    return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
  }

  private wallClock(time: string): string {
    return time.length >= 19 ? time.slice(11, 19) : time;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
