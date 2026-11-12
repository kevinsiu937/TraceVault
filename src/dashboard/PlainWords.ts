import type { Severity } from "../schema/Finding.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";

const KINDS: Record<string, string> = {
  "session.start": "The session started",
  "session.end": "The session ended",
  "prompt.user": "What the person asked the agent",
  "hook.script": "Commands run and web pages fetched",
  "document.access": "Files opened or changed",
  "mcp.call": "Add-on tools used",
  "skill.call": "Skills used",
  "admin.grant": "Permissions the person gave",
  "capture.gap": "Interruptions in the recording",
  "capture.duplicate": "Actions recorded twice",
  "guard.failure": "Times the safety check failed",
};

const RESULTS: Record<string, string> = {
  ok: "Done",
  error: "Failed",
  denied: "Refused",
  timeout: "Timed out",
  gap: "Missing",
  duplicate: "Repeat",
  unguarded: "Not checked",
  once: "Allowed once",
  always: "Allowed from now on",
  reject: "Refused",
  boundary: "",
  prompt: "",
};

const SEVERITIES: Record<Severity, string> = { high: "Serious", medium: "Worth checking", low: "Minor" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * The report's vocabulary for a reader with no IT background: event kinds,
 * results, severities and times in everyday words. Unknown values pass
 * through unchanged, so nothing recorded is ever hidden.
 */
export class PlainWords {
  kind(type: string): string {
    return KINDS[type] ?? type;
  }

  result(outcome: string): string {
    return RESULTS[outcome] ?? outcome;
  }

  severity(severity: Severity): string {
    return SEVERITIES[severity];
  }

  /**
   * What the agent did, as a short phrase: "changed the file /a/b", "ran the
   * command echo hi". `tried` gives the form after "tried to": "change the file /a/b".
   */
  action(entry: TimelineEntry, tried = false): string {
    if (!tried && entry.outcome === "denied") {
      return `tried to ${this.action(entry, true)}, but was refused`;
    }
    if (entry.type === "document.access") {
      const verb = entry.operation === "read" ? "read" : entry.operation === "write" ? (tried ? "change" : "changed") : (entry.operation ?? "use");
      return `${verb} the file ${entry.target}`;
    }
    if (entry.type === "hook.script") {
      return /^https?:\/\//.test(entry.target)
        ? `${tried ? "fetch" : "fetched"} the web page ${entry.target}`
        : `${tried ? "run" : "ran"} the command ${entry.target}`;
    }
    return entry.target.length === 0 || entry.target === "session" ? this.kind(entry.type) : entry.target;
  }

  /**
   * A recommendation split into the plain advice a reader sees and the hint for
   * the developer that "Explain more" holds. Rule files write the hint last, as
   * "(For the developer: ...)".
   */
  advice(recommendation: string): { readonly plain: string; readonly developer: string | null } {
    // shortcut: relies on the rule files' "(For the developer: ...)" convention; a text without it shows whole, which is safe.
    const match = /^(.*?)\s*\(For the developer: (.*)\)$/s.exec(recommendation);
    return match === null ? { plain: recommendation, developer: null } : { plain: match[1] ?? recommendation, developer: match[2] ?? null };
  }

  /** "9 Nov 2026, 14:19:46 UTC". Always UTC, so the same event reads the same everywhere. */
  dateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${this.clock(iso)} UTC`;
  }

  /** "14:19:46". */
  clock(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
  }
}
