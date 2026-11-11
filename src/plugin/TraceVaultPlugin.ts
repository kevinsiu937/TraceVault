import type { CallGuard } from "./CallGuard.js";
import type { EventForwarderPort } from "./EventForwarderPort.js";
import type { PendingGapStore } from "./PendingGapStore.js";
import { PermissionRequests, type PermissionProperties } from "./PermissionRequests.js";
import { SessionDelivery } from "./SessionDelivery.js";
import { SessionPreamble } from "./SessionPreamble.js";

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
  properties?: PermissionProperties & {
    sessionID?: string;
    part?: ToolPart;
    info?: {
      title?: unknown;
      parentID?: unknown;
      directory?: unknown;
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
  config: (config: unknown) => Promise<void>;
  "tool.execute.before": ToolBefore;
  "tool.execute.after": ToolAfter;
  "chat.message": ChatMessage;
  event: EventHook;
}

const PROMPT_LIMIT = 200;

export class TraceVaultPlugin {
  private readonly delivery: SessionDelivery;
  private readonly preamble: SessionPreamble;
  private readonly now: () => number;
  private readonly guard: CallGuard | null;
  private readonly permissions: PermissionRequests;
  private readonly pendingArgs = new Map<string, Record<string, unknown>>();
  private readonly pendingStarts = new Map<string, number>();

  constructor(
    forwarder: EventForwarderPort,
    gaps: PendingGapStore,
    now: () => number = () => performance.now(),
    /** Null unless the install opted in to blocking; then it may refuse a call before it runs. */
    guard: CallGuard | null = null,
    permissions: PermissionRequests = new PermissionRequests(),
    preamble: SessionPreamble = new SessionPreamble(),
  ) {
    this.delivery = new SessionDelivery(forwarder, gaps, preamble);
    this.preamble = preamble;
    this.now = now;
    this.guard = guard;
    this.permissions = permissions;
  }

  hooks(): TraceVaultHooks {
    return {
      // OpenCode calls this once, as it loads the plugin, before any session exists.
      config: async (config) => this.preamble.configure(config),
      "tool.execute.before": async (input, output) => {
        this.pendingArgs.set(this.key(input), output.args);
        this.pendingStarts.set(this.key(input), this.now());
        const verdict = this.guard?.inspect({ ...input, args: output.args });
        if (verdict?.kind === "failed") {
          await this.send({ hook: "guard.failure", ...input, reason: verdict.reason }, input.sessionID);
        } else if (verdict?.kind === "refuse") {
          // OpenCode hands the thrown message to the model as the call's result (probed 10 Nov 2026).
          throw new Error(verdict.message);
        }
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
          // Probed 7 Nov 2026: info.directory is the session's own folder; the plugin context's worktree is "/" outside git.
          const directory = event.properties?.info?.directory;
          await this.send(
            {
              hook: "session.created",
              sessionID,
              ...(typeof title === "string" && title.length > 0 ? { title } : {}),
              ...(typeof parentID === "string" && parentID.length > 0 ? { parentID } : {}),
              ...(typeof directory === "string" && directory.length > 0 ? { directory } : {}),
            },
            sessionID,
          );
          return;
        }
        if (event.type === "session.idle" && typeof sessionID === "string") {
          await this.send({ hook: "session.idle", sessionID }, sessionID);
          return;
        }
        if (event.type === "permission.asked") {
          this.permissions.ask(event.properties ?? {});
          return;
        }
        if (event.type === "permission.replied") {
          const grant = this.permissions.reply(event.properties ?? {});
          if (grant !== null) {
            await this.send(grant, grant.sessionID);
          }
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
        const blockedBy = this.guard?.refusedBy(partSession, part.callID) ?? null;
        await this.send(
          {
            hook: "tool.failed",
            input: { tool: part.tool, sessionID: partSession, callID: part.callID, args },
            error: typeof part.state.error === "string" ? part.state.error : "tool call failed",
            ...(durationMs === null ? {} : { durationMs }),
            ...(blockedBy === null ? {} : { blockedBy }),
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

  private send(payload: unknown, sessionID: string): Promise<void> {
    return this.delivery.send(payload, sessionID);
  }
}
