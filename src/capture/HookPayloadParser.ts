export interface ToolAfterPayload {
  readonly kind: "tool.after";
  readonly tool: string;
  readonly sessionID: string;
  readonly callID: string;
  readonly args: Record<string, unknown>;
  readonly exitCode: number | null;
}

export interface ToolFailedPayload {
  readonly kind: "tool.failed";
  readonly tool: string;
  readonly sessionID: string;
  readonly callID: string;
  readonly args: Record<string, unknown>;
  readonly error: string;
}

export interface SessionStartedPayload {
  readonly kind: "session.started";
  readonly sessionID: string;
  readonly title?: string;
}

export interface CaptureGapPayload {
  readonly kind: "capture.gap";
  readonly sessionID: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface SessionIdlePayload {
  readonly kind: "session.idle";
  readonly sessionID: string;
}

export type ParsedHook =
  | ToolAfterPayload
  | ToolFailedPayload
  | SessionStartedPayload
  | SessionIdlePayload
  | CaptureGapPayload;

export class HookPayloadParser {
  parse(raw: unknown): ParsedHook {
    const payload = this.asRecord(raw, "hook payload");
    const hook = this.asString(payload["hook"], "hook");

    if (hook === "tool.execute.after") {
      return this.parseToolAfter(payload);
    }
    if (hook === "tool.failed") {
      return this.parseToolFailed(payload);
    }
    if (hook === "capture.gap") {
      return {
        kind: "capture.gap",
        sessionID: this.asString(payload["sessionID"], "sessionID"),
        from: this.asString(payload["from"], "from"),
        to: this.asString(payload["to"], "to"),
        reason: this.asString(payload["reason"], "reason"),
      };
    }
    if (hook === "session.created" || hook === "session.idle") {
      const sessionID = this.asString(payload["sessionID"], "sessionID");
      if (hook === "session.idle") {
        return { kind: "session.idle", sessionID };
      }
      const title = payload["title"];
      return {
        kind: "session.started",
        sessionID,
        ...(typeof title === "string" && title.length > 0 ? { title } : {}),
      };
    }

    throw new TypeError(`unsupported hook '${hook}'`);
  }

  private parseToolAfter(payload: Record<string, unknown>): ToolAfterPayload {
    const input = this.asRecord(payload["input"], "input");
    const output = this.asRecord(payload["output"], "output");
    const metadata = output["metadata"] === undefined ? {} : this.asRecord(output["metadata"], "output.metadata");
    const exit = metadata["exit"];

    return {
      kind: "tool.after",
      tool: this.asString(input["tool"], "input.tool"),
      sessionID: this.asString(input["sessionID"], "input.sessionID"),
      callID: this.asString(input["callID"], "input.callID"),
      args: this.asRecord(input["args"], "input.args"),
      exitCode: typeof exit === "number" && Number.isFinite(exit) ? exit : null,
    };
  }

  private parseToolFailed(payload: Record<string, unknown>): ToolFailedPayload {
    const input = this.asRecord(payload["input"], "input");
    return {
      kind: "tool.failed",
      tool: this.asString(input["tool"], "input.tool"),
      sessionID: this.asString(input["sessionID"], "input.sessionID"),
      callID: this.asString(input["callID"], "input.callID"),
      args: input["args"] === undefined ? {} : this.asRecord(input["args"], "input.args"),
      error: this.asString(payload["error"], "error"),
    };
  }

  private asRecord(value: unknown, field: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new TypeError(`${field} must be an object`);
    }
    return value as Record<string, unknown>;
  }

  private asString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`${field} must be a non-empty string`);
    }
    return value;
  }
}
