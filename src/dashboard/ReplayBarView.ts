import { TurnBuilder } from "../service/TurnBuilder.js";
import { ReplayTimeline } from "./ReplayTimeline.js";
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
 * The replay bar: one row that turns the timeline into a re-watchable session.
 * Server-rendered state comes from `?t=`; the inline script only moves classes
 * and rewrites the URL, never the page.
 */
export class ReplayBarView implements SessionPaneView {
  readonly id = "replay";
  readonly label = "Replay";
  readonly slot = "bottom" as const;

  constructor(private readonly turnBuilder: TurnBuilder = new TurnBuilder()) {}

  render(context: SessionRenderContext): string {
    const replay = ReplayTimeline.from(context, this.turnBuilder);
    if (!replay.usable) {
      return "";
    }

    const position = replay.positionMs ?? 0;
    return `<div class="replay-bar" id="replay" data-total="${replay.totalMs}" data-t="${position}">
<div class="replay-controls">
<button type="button" class="replay-button" id="replay-play" aria-label="Play" aria-pressed="false">▶</button>
<button type="button" class="replay-button" id="replay-step" aria-label="Step forward">⏭</button>
<label class="replay-speed-label" for="replay-speed">Speed</label>
<select class="replay-speed" id="replay-speed" aria-label="Playback speed">
<option value="0.5">0.5×</option>
<option value="1" selected>1×</option>
<option value="2">2×</option>
<option value="4">4×</option>
</select>
<span class="replay-timer" id="replay-timer">${this.clock(position)} / ${this.clock(replay.totalMs)}</span>
</div>
<div class="replay-scrubber" id="replay-scrubber" role="slider" tabindex="0" aria-label="Playback position" aria-valuemin="0" aria-valuemax="${replay.totalMs}" aria-valuenow="${position}">
${this.ticks(replay)}
<div class="replay-cursor" id="replay-cursor" style="left:${replay.percent(position).toFixed(3)}%"></div>
</div>
</div>`;
  }

  styles(): string {
    return `.replay-bar{position:sticky;bottom:0;z-index:6;display:flex;align-items:center;gap:14px;min-height:56px;padding:8px 14px;background:color-mix(in srgb,var(--panel) 92%,transparent);backdrop-filter:blur(14px);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);font-variant-numeric:tabular-nums}
.replay-controls{display:flex;align-items:center;gap:8px;flex:none}
.replay-button{width:40px;height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--line);border-radius:10px;background:var(--panel-2);color:var(--text);font-size:14px;line-height:1;cursor:pointer}
.replay-button:hover{background:var(--panel);border-color:var(--accent)}
.replay-button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.replay-speed-label{color:var(--muted);font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.replay-speed{height:40px;padding:0 8px;border:1px solid var(--line);border-radius:10px;background:var(--panel-2);color:var(--text);font:13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.replay-speed:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.replay-timer{min-width:98px;color:var(--muted);font:12.5px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;text-align:right}
.replay-scrubber{position:relative;flex:1;min-width:120px;height:40px;cursor:pointer}
.replay-scrubber:before{content:"";position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:var(--line);border-radius:1px}
.replay-scrubber:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:8px}
.replay-tick{position:absolute;top:50%;width:2px;height:12px;margin-top:-6px;border-radius:1px;background:var(--muted)}
.replay-turn{width:3px;height:22px;margin-top:-11px;background:var(--text)}
.replay-error{width:3px;height:18px;margin-top:-9px;background:var(--err)}
.replay-denied{width:3px;height:18px;margin-top:-9px;background:var(--warn)}
.replay-gap{width:3px;height:18px;margin-top:-9px;background:var(--kind-gap)}
.replay-cursor{position:absolute;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-bg);pointer-events:none}
.replay-bar.is-playing .replay-button{background:var(--accent-bg);border-color:var(--accent)}
@media (max-width:640px){
  .replay-bar{flex-direction:column;align-items:stretch;gap:4px}
  .replay-speed-label{display:none}
  .replay-timer{text-align:left}
}`;
  }

  script(context: SessionRenderContext): string {
    const replay = ReplayTimeline.from(context, this.turnBuilder);
    if (!replay.usable) {
      return "";
    }
    const starts = JSON.stringify(replay.turns.map((span) => span.startMs));

    return `(function () {
  const bar = document.getElementById("replay");
  if (bar === null) return;
  const total = Number(bar.getAttribute("data-total")) || 0;
  const starts = ${starts};
  const timeline = document.getElementById("timeline");
  const playButton = document.getElementById("replay-play");
  const stepButton = document.getElementById("replay-step");
  const speedSelect = document.getElementById("replay-speed");
  const timer = document.getElementById("replay-timer");
  const scrubber = document.getElementById("replay-scrubber");
  const cursor = document.getElementById("replay-cursor");
  let t = Number(bar.getAttribute("data-t")) || 0;
  let playing = false;
  let rate = 1;
  let last = 0;
  let frame = null;
  const clamp = (value) => Math.max(0, Math.min(total, value));
  const format = (ms) => {
    const seconds = Math.floor(ms / 1000);
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  };
  const activeIndex = () => {
    let active = -1;
    for (let index = 0; index < starts.length; index += 1) {
      if (starts[index] <= t) active = index;
    }
    return active < 0 ? 0 : active;
  };
  const paint = () => {
    const active = activeIndex();
    if (timeline !== null) {
      let index = -1;
      for (const child of timeline.children) {
        if (child.classList.contains("turn-divider")) index += 1;
        child.classList.remove("is-past", "is-active");
        if (index < active) child.classList.add("is-past");
        else if (index === active) child.classList.add("is-active");
      }
    }
    if (cursor !== null) cursor.style.left = (total === 0 ? 0 : (t / total) * 100) + "%";
    if (timer !== null) timer.textContent = format(t) + " / " + format(total);
    if (scrubber !== null) scrubber.setAttribute("aria-valuenow", String(Math.round(t)));
  };
  const remember = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("t", String(Math.round(t)));
    history.replaceState(null, "", url);
  };
  const seek = (value, push) => {
    t = clamp(value);
    paint();
    if (push) remember();
  };
  const stop = () => {
    playing = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    bar.classList.remove("is-playing");
    if (playButton !== null) {
      playButton.textContent = "▶";
      playButton.setAttribute("aria-label", "Play");
      playButton.setAttribute("aria-pressed", "false");
    }
  };
  const tick = (now) => {
    if (!playing) return;
    const delta = last === 0 ? 0 : now - last;
    last = now;
    t = clamp(t + delta * rate);
    paint();
    if (t >= total) {
      remember();
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  const start = () => {
    if (playing) return;
    if (t >= total) t = 0;
    playing = true;
    last = 0;
    bar.classList.add("is-playing");
    if (playButton !== null) {
      playButton.textContent = "❚❚";
      playButton.setAttribute("aria-label", "Pause");
      playButton.setAttribute("aria-pressed", "true");
    }
    frame = requestAnimationFrame(tick);
  };
  const toggle = () => {
    if (playing) {
      stop();
      remember();
    } else {
      start();
    }
  };
  const stepForward = () => {
    const next = starts.find((value) => value > t);
    seek(next === undefined ? total : next, true);
  };
  const stepBack = () => {
    const previous = [...starts].reverse().find((value) => value < t);
    seek(previous === undefined ? 0 : previous, true);
  };
  if (playButton !== null) playButton.addEventListener("click", toggle);
  if (stepButton !== null) stepButton.addEventListener("click", stepForward);
  if (speedSelect !== null) speedSelect.addEventListener("change", () => {
    rate = Number(speedSelect.value) || 1;
  });
  if (scrubber !== null) scrubber.addEventListener("click", (event) => {
    const rect = scrubber.getBoundingClientRect();
    const ratio = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
    seek(ratio * total, true);
  });
  document.addEventListener("keydown", (event) => {
    const tag = event.target instanceof HTMLElement ? event.target.tagName : "";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (event.code === "Space") {
      event.preventDefault();
      toggle();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      stepForward();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepBack();
    }
  });
})();`;
  }

  private ticks(replay: ReplayTimeline): string {
    const turns = replay.turns.map((span) =>
      this.tick(
        "replay-turn",
        replay.percent(span.startMs),
        `${this.clock(span.startMs)} · ${span.turn.prompt ?? span.turn.label}`,
      ),
    );
    const moments = replay.moments.map((moment) =>
      this.tick(`replay-${moment.kind}`, replay.percent(moment.offsetMs), `${moment.kind} · ${moment.target}`),
    );
    return [...turns, ...moments].join("\n");
  }

  private tick(kind: string, percent: number, title: string): string {
    return `<div class="replay-tick ${kind}" style="left:${percent.toFixed(3)}%" title="${this.escape(title)}"></div>`;
  }

  private clock(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
