import type { EventForwarderPort } from "./EventForwarderPort.js";
import type { PendingGapStore } from "./PendingGapStore.js";

interface ToolExecuteInput {
  tool: string;
  sessionID: string;
  callID: string;
}

interface ToolExecuteAfterInput extends ToolExecuteInput {
  args: Record<string, unknown>;
}

interface ToolExecuteBeforeOutput {
  args: Record<string, unknown>;
}

interface ToolExecuteAfterOutput {
  title?: string;
  metadata?: Record<string, unknown>;
}

interface ToolPartState {
  status?: string;
  input?: Record<string, unknown>;
  error?: unknown;
}

interface ToolPart {
  type?: string;
  tool?: string;
  callID?: string;
  sessionID?: string;
  state?: ToolPartState;
}

interface PluginEvent {
  type?: string;
  properties?: {
    sessionID?: string;
    part?: ToolPart;
    info?: {
      title?: unknown;
      parentID?: unknown;
    };
  };
}

interface ChatMessageInput {
  sessionID?: string;
}

interface MessagePart {
  type?: string;
  text?: string;
}

interface ChatMessageOutput {
  message?: {
    id?: string;
    role?: string;
    sessionID?: string;
    time?: {
      created?: number;
    };
  };
  parts?: MessagePart[];
}

type ToolBefore = (input: ToolExecuteInput, output: ToolExecuteBeforeOutput) => Promise<void>;
type ToolAfter = (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
type EventHook = (input: { event: PluginEvent }) => Promise<void>;
type ChatMessage = (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;

export interface TraceVaultHooks {
  "tool.execute.before": ToolBefore;
  "tool.execute.after": ToolAfter;
  "chat.message": ChatMessage;
  event: EventHook;
}

const PROMPT_LIMIT = 200;

export class TraceVaultPlugin {
  private readonly forwarder: EventForwarderPort;
  private readonly gaps: PendingGapStore;
  private readonly now: () => number;
  private readonly pendingArgs = new Map<string, Record<string, unknown>>();
  private readonly pendingStarts = new Map<string, number>();

  constructor(
    forwarder: EventForwarderPort,
    gaps: PendingGapStore,
    now: () => number = () => performance.now(),
  ) {
    this.forwarder = forwarder;
    this.gaps = gaps;
    this.now = now;
  }

  hooks(): TraceVaultHooks {
    return {
      "tool.execute.before": async (input, output) => {
        this.pendingArgs.set(this.key(input), output.args);
        this.pendingStarts.set(this.key(input), this.now());
      },
      "tool.execute.after": async (input, output) => {
        const key = this.key(input);
        const args = input.args ?? this.pendingArgs.get(key) ?? {};
        const durationMs = this.takeDuration(key);
        await this.send(
          {
            hook: "tool.execute.after",
            input: { tool: input.tool, sessionID: input.sessionID, callID: input.callID, args },
            output: { title: output.title ?? "", metadata: output.metadata ?? {} },
            ...(durationMs === null ? {} : { durationMs }),
          },
          input.sessionID,
        );
      },
      "chat.message": async (input, output) => {
        const message = output.message;
        if (message?.role !== "user") {
          return;
        }
        const sessionID = message.sessionID ?? input.sessionID;
        const created = message.time?.created;
        if (typeof sessionID !== "string" || typeof message.id !== "string") {
          return;
        }
        if (typeof created !== "number" || !Number.isFinite(created)) {
          return;
        }
        const at = new Date(created);
        if (!Number.isFinite(at.getTime())) {
          return;
        }

        const text = (output.parts ?? [])
          .flatMap((part) => (part.type === "text" && typeof part.text === "string" ? [part.text] : []))
          .join(" ")
          .trim();
        if (text.length === 0) {
          return;
        }

        // The text is the evidence, so it is kept; 200 chars is the readable cap for one timeline row.
        const truncated = text.length > PROMPT_LIMIT;
        await this.send(
          {
            hook: "chat.message",
            sessionID,
            messageID: message.id,
            createdAt: at.toISOString(),
            text: truncated ? text.slice(0, PROMPT_LIMIT) : text,
            truncated,
          },
          sessionID,
        );
      },
      event: async ({ event }) => {
        const sessionID = event.properties?.sessionID;
        if (event.type === "session.created" && typeof sessionID === "string") {
          const title = event.properties?.info?.title;
          const parentID = event.properties?.info?.parentID;
          await this.send(
            {
              hook: "session.created",
              sessionID,
              ...(typeof title === "string" && title.length > 0 ? { title } : {}),
              ...(typeof parentID === "string" && parentID.length > 0 ? { parentID } : {}),
            },
            sessionID,
          );
          return;
        }
        if (event.type === "session.idle" && typeof sessionID === "string") {
          await this.send({ hook: "session.idle", sessionID }, sessionID);
          return;
        }
        if (event.type !== "message.part.updated") {
          return;
        }

        const part = event.properties?.part;
        if (part?.type !== "tool" || part.state?.status !== "error") {
          return;
        }
        const partSession = part.sessionID ?? sessionID;
        if (typeof part.tool !== "string" || typeof part.callID !== "string" || typeof partSession !== "string") {
          return;
        }
        const key = `${partSession}:${part.callID}`;
        const args = part.state.input ?? this.pendingArgs.get(key) ?? {};
        const durationMs = this.takeDuration(key);
        await this.send(
          {
            hook: "tool.failed",
            input: { tool: part.tool, sessionID: partSession, callID: part.callID, args },
            error: typeof part.state.error === "string" ? part.state.error : "tool call failed",
            ...(durationMs === null ? {} : { durationMs }),
          },
          partSession,
        );
      },
    };
  }

  private key(input: ToolExecuteInput): string {
    return `${input.sessionID}:${input.callID}`;
  }

  // Elapsed time for this call, and drop both records so neither map can grow.
  private takeDuration(key: string): number | null {
    const started = this.pendingStarts.get(key);
    this.pendingArgs.delete(key);
    this.pendingStarts.delete(key);
    return started === undefined ? null : Math.max(0, Math.round(this.now() - started));
  }

  private async send(payload: unknown, sessionID: string): Promise<void> {
    try {
      await this.forwarder.forward(payload);
    } catch {
      // Capture is best-effort: a failed forward must never break the agent's tool call.
      this.gaps.record(sessionID, new Date());
      return;
    }

    await this.flushGaps();
  }

  private async flushGaps(): Promise<void> {
    const gaps = this.gaps.load();
    const flushed: string[] = [];

    for (const gap of gaps) {
      try {
        await this.forwarder.forward({
          hook: "capture.gap",
          sessionID: gap.sessionID,
          from: gap.from,
          to: gap.lastFailureAt,
          reason: "capture endpoint unavailable",
        });
        flushed.push(gap.sessionID);
      } catch {
        // Keep this gap and the rest for the next successful forward.
        break;
      }
    }

    if (flushed.length > 0) {
      this.gaps.remove(flushed);
    }
  }
}
