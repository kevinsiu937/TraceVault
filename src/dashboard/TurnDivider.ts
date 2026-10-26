import type { Turn } from "../service/Turn.js";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const PROMPT_LIMIT = 90;

/** The divider that introduces one turn inside the timeline list. */
export class TurnDivider {
  render(turn: Turn): string {
    const errors = turn.entries.filter((entry) => entry.outcome === "error").length;
    const denied = turn.entries.filter((entry) => entry.outcome === "denied").length;
    const classes = ["turn-divider"];
    if (errors > 0) {
      classes.push("has-errors");
    } else if (denied > 0) {
      classes.push("has-denied");
    }

    const actions = turn.entries.filter((entry) => entry.type !== "prompt.user").length;
    const meta = [
      `${actions} ${actions === 1 ? "action" : "actions"}`,
      this.duration(turn),
    ];
    if (errors > 0) {
      meta.push(`${errors} ${errors === 1 ? "error" : "errors"}`);
    }
    if (denied > 0) {
      meta.push(`${denied} denied`);
    }

    return `<li class="${classes.join(" ")}"><span class="turn-prompt">${this.escape(this.truncate(turn.prompt ?? turn.label))}</span><span class="turn-meta">${this.escape(meta.join(" · "))}</span></li>`;
  }

  private duration(turn: Turn): string {
    if (turn.entries.length < 2) {
      return "—";
    }
    const first = Date.parse(turn.entries[0]?.time ?? "");
    const last = Date.parse(turn.entries[turn.entries.length - 1]?.time ?? "");
    if (!Number.isFinite(first) || !Number.isFinite(last)) {
      return "—";
    }
    const milliseconds = Math.max(0, last - first);
    return milliseconds < 1000 ? `${Math.round(milliseconds)}ms` : `${(milliseconds / 1000).toFixed(1)}s`;
  }

  private truncate(text: string): string {
    return text.length <= PROMPT_LIMIT ? text : `${text.slice(0, PROMPT_LIMIT - 1)}…`;
  }

  private escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
  }
}
