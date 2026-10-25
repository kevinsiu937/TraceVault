import type { EventForwarder } from "./EventForwarder.js";

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
    };
  };
}

type ToolBefore = (input: ToolExecuteInput, output: ToolExecuteBeforeOutput) => Promise<void>;
type ToolAfter = (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
type EventHook = (input: { event: PluginEvent }) => Promise<void>;

export interface TraceVaultHooks {
  "tool.execute.before": ToolBefore;
  "tool.execute.after": ToolAfter;
  event: EventHook;
}

export class TraceVaultPlugin {
  private readonly forwarder: EventForwarder;
  private readonly pendingArgs = new Map<string, Record<string, unknown>>();
  private pendingGap: { from: string; sessionID: string } | null = null;

  constructor(forwarder: EventForwarder) {
    this.forwarder = forwarder;
  }

  hooks(): TraceVaultHooks {
    return {
      "tool.execute.before": async (input, output) => {
        this.pendingArgs.set(this.key(input), output.args);
      },
      "tool.execute.after": async (input, output) => {
        const args = input.args ?? this.pendingArgs.get(this.key(input)) ?? {};
        this.pendingArgs.delete(this.key(input));
        await this.send(
          {
            hook: "tool.execute.after",
            input: { tool: input.tool, sessionID: input.sessionID, callID: input.callID, args },
            output: { title: output.title ?? "", metadata: output.metadata ?? {} },
          },
          input.sessionID,
        );
      },
      event: async ({ event }) => {
        const sessionID = event.properties?.sessionID;
        if (event.type === "session.created" && typeof sessionID === "string") {
          const title = event.properties?.info?.title;
          await this.send(
            {
              hook: "session.created",
              sessionID,
              ...(typeof title === "string" && title.length > 0 ? { title } : {}),
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
        this.pendingArgs.delete(key);
        await this.send(
          {
            hook: "tool.failed",
            input: { tool: part.tool, sessionID: partSession, callID: part.callID, args },
            error: typeof part.state.error === "string" ? part.state.error : "tool call failed",
          },
          partSession,
        );
      },
    };
  }

  private key(input: ToolExecuteInput): string {
    return `${input.sessionID}:${input.callID}`;
  }

  private async send(payload: unknown, sessionID: string): Promise<void> {
    try {
      await this.forwarder.forward(payload);
    } catch {
      // Capture is best-effort: a failed forward must never break the agent's tool call.
      this.pendingGap ??= { from: new Date().toISOString(), sessionID };
      return;
    }

    if (this.pendingGap === null) {
      return;
    }
    const gap = this.pendingGap;
    this.pendingGap = null;
    try {
      await this.forwarder.forward({
        hook: "capture.gap",
        sessionID: gap.sessionID,
        from: gap.from,
        to: new Date().toISOString(),
        reason: "capture endpoint unavailable",
      });
    } catch {
      this.pendingGap = gap;
    }
  }
}
