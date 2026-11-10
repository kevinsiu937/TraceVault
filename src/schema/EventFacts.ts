import type { Event } from "./Event.js";
import type { EventType } from "./EventType.js";

/** The facts a rule may test. A rule naming anything else fails to load. */
export type FactName = "type" | "target" | "outcome" | "operation" | "path" | "tool" | "text" | "project" | "call";

export const FACT_NAMES: readonly FactName[] = [
  "type",
  "target",
  "outcome",
  "operation",
  "path",
  "tool",
  "text",
  "project",
  "call",
];

/** A call is something the agent did; the rest are boundaries and capture bookkeeping. */
const CALLS: Readonly<Record<EventType, boolean>> = {
  "hook.script": true,
  "document.access": true,
  "mcp.call": true,
  "skill.call": true,
  "session.start": false,
  "session.end": false,
  "capture.gap": false,
  "capture.duplicate": false,
  "prompt.user": false,
  "admin.grant": false,
  "guard.failure": false,
};

/**
 * One projection of an event into the facts every reader shares: the timeline
 * renders them and the scanner's rules match on them, so the two cannot disagree.
 */
export class EventFacts {
  private constructor(
    private readonly values: Readonly<Record<FactName, string | null>>,
    readonly isCall: boolean,
    /** A prompt the agent injected itself, not one the user typed. */
    readonly isHarnessPrompt: boolean,
  ) {}

  static of(event: Event): EventFacts {
    const harness = event.type === "prompt.user" && EventFacts.harnessInjected(event.data.text);
    return new EventFacts(
      {
        type: event.type,
        target: EventFacts.target(event),
        outcome: EventFacts.outcome(event),
        operation: event.type === "document.access" ? event.data.operation : null,
        path: event.type === "document.access" ? event.data.path : null,
        tool: EventFacts.tool(event),
        text: event.type === "prompt.user" && !harness ? event.data.text : null,
        project: event.type === "session.start" ? (event.data.project_dir ?? null) : null,
        call: EventFacts.call(event),
      },
      CALLS[event.type],
      harness,
    );
  }

  get(name: FactName): string | null {
    return this.values[name];
  }

  get target(): string {
    return this.values.target ?? "";
  }

  get outcome(): string {
    return this.values.outcome ?? "";
  }

  get operation(): string | null {
    return this.values.operation;
  }

  /**
   * The agent injects its own prompts (the measured <available-skills> block).
   * They open with a tag and close within the first 200 characters.
   */
  private static harnessInjected(text: string): boolean {
    return text.startsWith("<") && text.slice(0, 200).includes("</");
  }

  /** The tool call's id: a call's own, or the one a permission prompt was raised for. */
  private static call(event: Event): string | null {
    if (event.type === "admin.grant") {
      return event.data.call_id ?? null;
    }
    return CALLS[event.type] ? event.correlation_id : null;
  }

  /** The agent tool behind a call: `bash`, `webfetch`, or an MCP server's tool name. */
  private static tool(event: Event): string | null {
    if (event.type === "hook.script") {
      return event.data.target_tool;
    }
    if (event.type === "admin.grant") {
      return event.data.permission;
    }
    if (event.type === "guard.failure") {
      return event.data.tool;
    }
    return event.type === "mcp.call" ? event.data.tool : null;
  }

  private static target(event: Event): string {
    switch (event.type) {
      case "document.access":
        return event.data.path;
      case "mcp.call":
        return `${event.data.server} · ${event.data.tool}`;
      case "skill.call":
        return event.data.skill;
      case "hook.script":
        return event.data.target;
      case "capture.gap":
        return event.data.reason;
      case "capture.duplicate":
        return event.data.of_event_id;
      case "prompt.user":
        return event.data.text;
      case "admin.grant":
        // One pattern per line: a rule splits them back apart, and a command-prefix pattern never holds a newline.
        return event.data.patterns.join("\n");
      case "guard.failure":
        return event.data.reason;
      case "session.start":
      case "session.end":
        return "session";
    }
  }

  private static outcome(event: Event): string {
    switch (event.type) {
      case "document.access":
      case "mcp.call":
      case "skill.call":
      case "hook.script":
        return event.data.outcome;
      case "capture.gap":
        return "gap";
      case "capture.duplicate":
        return "duplicate";
      case "prompt.user":
        return "prompt";
      case "admin.grant":
        return event.data.reply;
      case "guard.failure":
        return "unguarded";
      case "session.start":
      case "session.end":
        return "boundary";
    }
  }
}
