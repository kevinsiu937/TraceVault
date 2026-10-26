import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { SessionPaneView } from "./SessionPaneView.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";
import type { SessionParams } from "./SessionParams.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const TICKS = [0, 1, 2, 3, 4] as const;

interface GapWindow {
  readonly from: number;
  readonly to: number;
  readonly rawFrom: string;
  readonly rawTo: string;
  readonly reason: string;
}

/**
 * The centre Waterfall pane: the same session entries as bars on a real
 * wall-clock axis. Presentation only — the shell decides when it renders.
 */
export class WaterfallView implements SessionPaneView {
  readonly id = "waterfall";
  readonly label = "Waterfall";
  readonly slot = "center" as const;

  render(context: SessionRenderContext): string {
    const entries = context.entries;
    const empty = '<div class="wf-empty" role="status">No events to plot in this session.</div>';
    const first = entries[0];
    if (first === undefined) {
      return empty;
    }
    const t0 = this.time(first.time);
    if (t0 === null) {
      return empty;
    }
    const last = entries[entries.length - 1];
    const lastStart = last === undefined ? t0 : this.time(last.time);
    let span = lastStart === null ? 0 : lastStart + (last?.durationMs ?? 0) - t0;
    if (span <= 0) {
      span = 1000;
    }

    const basePath = `/sessions/${encodeURIComponent(context.sessionId)}`;
    const ticks = TICKS.map((tick) => {
      const left = this.percent((tick * 100) / (TICKS.length - 1));
      const at = t0 + (span * tick) / (TICKS.length - 1);
      return `<span class="wf-tick" style="left:${left}%">${this.escape(this.wallClock(at))}</span>`;
    }).join("");
    const gridlines = TICKS.map((tick) => {
      const left = this.percent((tick * 100) / (TICKS.length - 1));
      return `<span class="wf-gridline" style="left:${left}%"></span>`;
    }).join("");
    const lanes = entries
      .map((entry, index) => this.lane(entry, entries[index + 1], t0, span, basePath, context.state))
      .join("\n");

    return `<div class="wf" id="waterfall">
<div class="wf-axis">${ticks}</div>
<div class="wf-plot">${gridlines}
<ol class="wf-lanes" aria-label="Session events">
${lanes}
</ol>
</div>
</div>`;
  }

  styles(): string {
    return `.wf{display:block;overflow-x:clip}
.wf-axis{position:relative;height:18px;margin:0 0 4px;font:11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);font-variant-numeric:tabular-nums}
.wf-tick{position:absolute;transform:translateX(-50%);white-space:nowrap}
.wf-tick:first-child{transform:none}
.wf-tick:last-child{transform:translateX(-100%)}
.wf-plot{position:relative}
.wf-gridline{position:absolute;top:0;bottom:0;width:1px;background:var(--line);opacity:.55;pointer-events:none}
.wf-lanes{list-style:none;margin:0;padding:0;position:relative;z-index:1}
.wf-lane{position:relative;height:21px}
.wf-bar{position:absolute;top:6px;height:9px;border-radius:3px;background:var(--kind-session);display:block}
.wf-bar:hover{filter:brightness(1.18)}
.wf-bar:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wf-bar[data-kind="hook.script"]{background:var(--kind-hook)}
.wf-bar[data-kind="document.access"]{background:var(--kind-document)}
.wf-bar[data-kind="mcp.call"]{background:var(--kind-mcp)}
.wf-bar[data-kind="skill.call"]{background:var(--kind-skill)}
.wf-bar[data-kind="session.start"],.wf-bar[data-kind="session.end"]{background:var(--kind-session)}
.wf-ring-error{outline:2px solid var(--err);outline-offset:2px}
.wf-ring-denied{outline:2px dashed var(--warn);outline-offset:2px}
.wf-bar.selected{outline:2px solid var(--text);outline-offset:2px}
.wf-gap{position:absolute;top:2px;height:16px;border-radius:3px;border:1px solid color-mix(in srgb,var(--kind-gap) 55%,var(--line));background:repeating-linear-gradient(135deg,color-mix(in srgb,var(--kind-gap) 28%,transparent) 0 3px,transparent 3px 7px);display:flex;align-items:center;overflow:hidden}
.wf-gap:hover{filter:brightness(1.15)}
.wf-gap:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.wf-gap.selected{outline:2px solid var(--text);outline-offset:2px}
.wf-gap-reason{font:10px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--kind-gap);padding:0 5px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-empty{color:var(--muted);font-size:13.5px;margin:0;line-height:1.55}
@media (max-width:640px){
.wf-tick:nth-child(even){display:none}
}`;
  }

  script(_context: SessionRenderContext): string {
    return "";
  }

  private lane(
    entry: TimelineEntry,
    next: TimelineEntry | undefined,
    t0: number,
    span: number,
    basePath: string,
    state: SessionParams,
  ): string {
    if (entry.type === "capture.gap") {
      return this.gapLane(entry, t0, span, basePath, state);
    }

    const time = this.time(entry.time) ?? t0;
    const nextTime = next === undefined ? null : this.time(next.time);
    const duration = Math.max(0, entry.durationMs ?? (nextTime === null ? 0 : nextTime - time));
    const left = this.percent(this.clamp((time - t0) / span * 100));
    const width = this.percent(Math.min(100, Math.max(2, duration / span * 100)));
    const selected = state.event === entry.eventId;
    const classes = ["wf-bar"];
    if (selected) {
      classes.push("selected");
    }
    if (entry.outcome === "error") {
      classes.push("wf-ring-error");
    } else if (entry.outcome === "denied") {
      classes.push("wf-ring-denied");
    }
    const href = state.href(basePath, { view: "waterfall", event: entry.eventId });
    const label = `${this.wallClock(time)} ${entry.type} ${entry.target} ${entry.outcome} ${this.durationLabel(duration)}`;

    return `<li class="wf-lane" data-event-id="${this.escape(entry.eventId)}" data-kind="${this.escape(entry.type)}" data-outcome="${this.escape(entry.outcome)}">
<a class="${classes.join(" ")}" href="${this.escape(href)}" style="left:${left}%;width:${width}%" data-left="${left}" data-width="${width}" data-kind="${this.escape(entry.type)}" data-outcome="${this.escape(entry.outcome)}" data-event-id="${this.escape(entry.eventId)}"${selected ? ' aria-current="true"' : ""} aria-label="${this.escape(label)}" title="${this.escape(label)}"></a>
</li>`;
  }

  private gapLane(
    entry: TimelineEntry,
    t0: number,
    span: number,
    basePath: string,
    state: SessionParams,
  ): string {
    const stored = this.gapWindow(entry);
    const ownTime = this.time(entry.time) ?? t0;
    const from = stored?.from ?? ownTime;
    const to = stored?.to ?? ownTime;
    const rawFrom = stored?.rawFrom ?? entry.time;
    const rawTo = stored?.rawTo ?? entry.time;
    const reason = stored?.reason ?? entry.target;
    const left = this.percent(this.clamp((from - t0) / span * 100));
    const width = this.percent(Math.min(100, Math.max(2, (to - from) / span * 100)));
    const selected = state.event === entry.eventId;
    const href = state.href(basePath, { view: "waterfall", event: entry.eventId });
    const label = `capture gap ${reason} from ${this.wallClock(from)} to ${this.wallClock(to)}`;

    return `<li class="wf-lane" data-event-id="${this.escape(entry.eventId)}" data-kind="capture.gap" data-outcome="gap">
<a class="wf-gap${selected ? " selected" : ""}" href="${this.escape(href)}" style="left:${left}%;width:${width}%" data-from="${this.escape(rawFrom)}" data-to="${this.escape(rawTo)}" data-kind="capture.gap" data-event-id="${this.escape(entry.eventId)}"${selected ? ' aria-current="true"' : ""} aria-label="${this.escape(label)}"><span class="wf-gap-reason">${this.escape(reason)}</span></a>
</li>`;
  }

  /**
   * TimelineEntry keeps the gap window only inside the stored event JSON, so the
   * band has to read `data.from` / `data.to` / `data.reason` from `detail`.
   */
  private gapWindow(entry: TimelineEntry): GapWindow | null {
    try {
      const parsed: unknown = JSON.parse(entry.detail);
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const data = (parsed as Record<string, unknown>).data;
      if (typeof data !== "object" || data === null) {
        return null;
      }
      const record = data as Record<string, unknown>;
      const from = record.from;
      const to = record.to;
      const reason = record.reason;
      if (typeof from !== "string" || typeof to !== "string") {
        return null;
      }
      const fromTime = this.time(from);
      const toTime = this.time(to);
      if (fromTime === null || toTime === null) {
        return null;
      }
      return {
        from: fromTime,
        to: toTime,
        rawFrom: from,
        rawTo: to,
        reason: typeof reason === "string" && reason.length > 0 ? reason : entry.target,
      };
    } catch {
      return null;
    }
  }

  private time(value: string): number | null {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private percent(value: number): string {
    return Number.isFinite(value) ? this.clamp(value).toFixed(2) : "0.00";
  }

  private clamp(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  private wallClock(time: number): string {
    return new Date(time).toISOString().slice(11, 19);
  }

  private durationLabel(milliseconds: number): string {
    return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
