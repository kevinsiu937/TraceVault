import type { CallGuard } from "./CallGuard.js";
import type { EventForwarderPort } from "./EventForwarderPort.js";
import type { PendingGapStore } from "./PendingGapStore.js";
import type { ToolExecuteInput, TraceVaultHooks } from "./OpenCodeHooks.js";
import { PermissionRequests } from "./PermissionRequests.js";
import { SessionDelivery } from "./SessionDelivery.js";
import { SessionPreamble } from "./SessionPreamble.js";
import { PendingCalls } from "./PendingCalls.js";
import { ShellProxies } from "./ShellProxies.js";
import { UserPrompt } from "./UserPrompt.js";

export class TraceVaultPlugin {
  private readonly delivery: SessionDelivery;
  private readonly preamble: SessionPreamble;
  private readonly guard: CallGuard | null;
  private readonly permissions: PermissionRequests;
  private readonly shell: ShellProxies;
  private readonly pending: PendingCalls;
  private readonly prompt = new UserPrompt();

  constructor(
    forwarder: EventForwarderPort,
    gaps: PendingGapStore,
    now: () => number = () => performance.now(),
    /** Null unless the install opted in to blocking; then it may refuse a call before it runs. */
    guard: CallGuard | null = null,
    permissions: PermissionRequests = new PermissionRequests(),
    preamble: SessionPreamble = new SessionPreamble(),
    shell: ShellProxies = new ShellProxies(),
  ) {
    this.delivery = new SessionDelivery(forwarder, gaps, preamble);
    this.preamble = preamble;
    this.pending = new PendingCalls(now);
    this.guard = guard;
    this.permissions = permissions;
    this.shell = shell;
  }

  hooks(): TraceVaultHooks {
    return {
      // OpenCode calls this once, as it loads the plugin, before any session exists.
      config: async (config) => this.preamble.configure(config),
      "tool.execute.before": async (input, output) => {
        this.pending.start(this.key(input), output.args);
        const verdict = this.guard?.inspect({ ...input, args: output.args });
        if (verdict?.kind === "failed") {
          await this.send({ hook: "guard.failure", ...input, reason: verdict.reason }, input.sessionID);
        } else if (verdict?.kind === "refuse") {
          // OpenCode hands the thrown message to the model as the call's result (probed 10 Nov 2026).
          throw new Error(verdict.message);
        }
      },
      "tool.execute.after": async (input, output) => {
        const started = this.pending.finish(this.key(input));
        const args = input.args ?? started.args ?? {};
        const { durationMs } = started;
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
        const prompt = this.prompt.of(input, output);
        if (prompt !== null) {
          await this.send(prompt, prompt.sessionID);
        }
      },
      // Called before each bash call runs; the variables it sets reach that call's shell (probed 15 Nov 2026).
      "shell.env": async (input, output) => {
        const { sessionID, callID } = input;
        if (typeof sessionID !== "string" || typeof callID !== "string") {
          return;
        }
        // Delivery runs beside the forwarding: a service that is down never holds a connection up.
        const unwatched = await this.shell.point({ sessionID, callID }, output.env, (connection) => void this.send(connection, sessionID));
        if (unwatched !== null) {
          const at = new Date().toISOString();
          await this.send({ hook: "capture.gap", sessionID, from: at, to: at, reason: unwatched }, sessionID);
        }
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
        const started = this.pending.finish(`${partSession}:${part.callID}`);
        const args = part.state.input ?? started.args ?? {};
        const { durationMs } = started;
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

  private send(payload: unknown, sessionID: string): Promise<void> {
    return this.delivery.send(payload, sessionID);
  }
}
