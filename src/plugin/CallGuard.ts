import type { ToolClassifier } from "../capture/ToolClassifier.js";
import type { WorkflowScannerPort } from "../scanner/dynamic/WorkflowScannerPort.js";
import type { EventFactory } from "../schema/EventFactory.js";

export interface PendingCall {
  readonly tool: string;
  readonly sessionID: string;
  readonly callID: string;
  readonly args: Record<string, unknown>;
}

export type GuardVerdict =
  | { readonly kind: "allow" }
  | { readonly kind: "refuse"; readonly message: string }
  | { readonly kind: "failed"; readonly reason: string };

/**
 * Decides, before a call runs, whether a blockable rule refuses it. It never
 * throws: rules that will not load, or any error while deciding, let the call
 * through as `failed`, so the guard can never break the agent.
 */
export class CallGuard {
  private rules: WorkflowScannerPort | Error | undefined;
  private readonly refusals = new Map<string, string>();

  constructor(
    private readonly load: () => WorkflowScannerPort,
    private readonly classifier: ToolClassifier,
    private readonly factory: EventFactory,
  ) {}

  inspect(call: PendingCall): GuardVerdict {
    try {
      const pending = this.factory.fromClassified(
        { sessionId: call.sessionID, correlationId: call.callID, receivedAt: new Date() },
        // No blockable rule tests the outcome, so the placeholder never decides anything.
        this.classifier.classify(call.tool, call.args, "ok", null),
      );
      const ruleId = this.scanner().blockedBy(pending);
      if (ruleId === null) {
        return { kind: "allow" };
      }
      this.refusals.set(`${call.sessionID}:${call.callID}`, ruleId);
      return {
        kind: "refuse",
        message:
          `TraceVault skipped this call because it matches the rule '${ruleId}', which marks it as dangerous. ` +
          "It did not run. Do not retry it or reach the same result another way, such as through the shell. " +
          "Continue with the rest of the task. The skipped call has been recorded and will be reported to the user.",
      };
    } catch (error) {
      return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
  }

  /** The rule that refused this call, given once: the record is dropped as it is read. */
  refusedBy(sessionID: string, callID: string): string | null {
    const key = `${sessionID}:${callID}`;
    const ruleId = this.refusals.get(key) ?? null;
    this.refusals.delete(key);
    return ruleId;
  }

  private scanner(): WorkflowScannerPort {
    if (this.rules === undefined) {
      try {
        this.rules = this.load();
      } catch (error) {
        this.rules = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (this.rules instanceof Error) {
      throw new Error(`rules did not load: ${this.rules.message}`);
    }
    return this.rules;
  }
}
