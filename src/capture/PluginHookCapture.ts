import type { CapturePort } from "./CapturePort.js";
import { DenialSignal } from "./DenialSignal.js";
import type { HookPayloadParser } from "./HookPayloadParser.js";
import { PayloadDigest } from "./PayloadDigest.js";
import type { ToolClassifier } from "./ToolClassifier.js";
import type { Event } from "../schema/Event.js";
import type { EventFactory } from "../schema/EventFactory.js";
import type { Outcome } from "../schema/Outcome.js";

// The plugin's clock may run a little ahead of the service's.
const CLOCK_JITTER_MS = 5000;

export class PluginHookCapture implements CapturePort {
  constructor(
    private readonly parser: HookPayloadParser,
    private readonly classifier: ToolClassifier,
    private readonly factory: EventFactory,
    private readonly denial: DenialSignal = new DenialSignal(),
    private readonly digest: PayloadDigest = new PayloadDigest(),
  ) {}

  toEvent(raw: unknown, arrivedAt: Date, mcpServers: (sessionId: string) => readonly string[] = () => []): Event | null {
    const hook = this.parser.parse(raw);
    // A payload sent late from the plugin's outbox sorts when it was observed, never later than it arrived.
    const observedAt = this.parser.observedAt(raw);
    const receivedAt = observedAt !== null && observedAt.getTime() <= arrivedAt.getTime() + CLOCK_JITTER_MS ? observedAt : arrivedAt;

    if (hook.kind === "session.started") {
      return this.factory.sessionStart({
        sessionId: hook.sessionID,
        correlationId: null,
        receivedAt,
        ...(hook.title === undefined ? {} : { title: hook.title }),
        parentSessionId: hook.parentID ?? null,
        projectDir: hook.directory ?? null,
      });
    }
    if (hook.kind === "session.idle") {
      return this.factory.sessionEnd({ sessionId: hook.sessionID, correlationId: null, receivedAt });
    }
    if (hook.kind === "capture.gap") {
      return this.factory.captureGap(
        // The gap sorts where the outage ended, not where the retry arrived.
        { sessionId: hook.sessionID, correlationId: null, receivedAt: new Date(hook.to) },
        { from: hook.from, to: hook.to, reason: hook.reason },
      );
    }
    if (hook.kind === "user.prompt") {
      return this.factory.promptUser(
        // The prompt sorts when the user sent it, not when the service read it.
        { sessionId: hook.sessionID, correlationId: hook.messageID, receivedAt: new Date(hook.createdAt) },
        { text: hook.text, message_id: hook.messageID, truncated: hook.truncated },
      );
    }
    if (hook.kind === "permission.granted") {
      return this.factory.adminGrant(
        { sessionId: hook.sessionID, correlationId: hook.requestID, receivedAt },
        {
          permission: hook.permission,
          patterns: hook.patterns,
          reply: hook.reply,
          ...(hook.callID === undefined ? {} : { call_id: hook.callID }),
        },
      );
    }

    if (hook.kind === "config.snapshot") {
      return this.factory.configSnapshot(
        { sessionId: hook.sessionID, correlationId: null, receivedAt },
        { digest: this.digest.describe(hook.config).digest, config: hook.config },
      );
    }

    if (hook.kind === "mcp.tools") {
      return this.factory.mcpTools(
        { sessionId: hook.sessionID, correlationId: null, receivedAt },
        { server: hook.server, digest: this.digest.describe(hook.tools).digest, tools: hook.tools },
      );
    }

    if (hook.kind === "guard.failure") {
      return this.factory.guardFailure(
        { sessionId: hook.sessionID, correlationId: null, receivedAt },
        { tool: hook.tool, call_id: hook.callID, reason: hook.reason },
      );
    }

    if (hook.kind === "net.connect") {
      return this.factory.netConnect({ sessionId: hook.sessionID, correlationId: null, receivedAt }, hook.data);
    }

    const blockedBy = hook.kind === "tool.failed" ? hook.blockedBy : undefined;
    const outcome: Outcome =
      hook.kind === "tool.failed"
        ? blockedBy !== undefined || this.denial.isDenial(hook.error)
          ? "denied"
          : "error"
        : hook.exitCode !== null && hook.exitCode !== 0
          ? "error"
          : "ok";

    const exitCode = hook.kind === "tool.after" ? hook.exitCode : null;
    const classified = this.classifier.classify(hook.tool, hook.args, outcome, exitCode, () => mcpServers(hook.sessionID));

    return this.factory.fromClassified(
      {
        sessionId: hook.sessionID,
        correlationId: hook.callID,
        receivedAt,
        durationMs: hook.durationMs,
      },
      classified,
      blockedBy,
    );
  }
}
