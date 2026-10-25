import type { CapturePort } from "./CapturePort.js";
import { DenialSignal } from "./DenialSignal.js";
import type { HookPayloadParser } from "./HookPayloadParser.js";
import type { ToolClassifier } from "./ToolClassifier.js";
import type { Event } from "../schema/Event.js";
import type { EventFactory } from "../schema/EventFactory.js";
import type { Outcome } from "../schema/Outcome.js";

export class PluginHookCapture implements CapturePort {
  constructor(
    private readonly parser: HookPayloadParser,
    private readonly classifier: ToolClassifier,
    private readonly factory: EventFactory,
    private readonly denial: DenialSignal = new DenialSignal(),
  ) {}

  toEvent(raw: unknown, receivedAt: Date): Event | null {
    const hook = this.parser.parse(raw);

    if (hook.kind === "session.started") {
      return this.factory.sessionStart({
        sessionId: hook.sessionID,
        correlationId: null,
        receivedAt,
        ...(hook.title === undefined ? {} : { title: hook.title }),
      });
    }
    if (hook.kind === "session.idle") {
      return this.factory.sessionEnd({ sessionId: hook.sessionID, correlationId: null, receivedAt });
    }
    if (hook.kind === "capture.gap") {
      return this.factory.captureGap(
        { sessionId: hook.sessionID, correlationId: null, receivedAt },
        { from: hook.from, to: hook.to, reason: hook.reason },
      );
    }

    const outcome: Outcome =
      hook.kind === "tool.failed"
        ? this.denial.isDenial(hook.error)
          ? "denied"
          : "error"
        : hook.exitCode !== null && hook.exitCode !== 0
          ? "error"
          : "ok";

    const exitCode = hook.kind === "tool.after" ? hook.exitCode : null;
    const classified = this.classifier.classify(hook.tool, hook.args, outcome, exitCode);

    return this.factory.fromClassified(
      { sessionId: hook.sessionID, correlationId: hook.callID, receivedAt },
      classified,
    );
  }
}
