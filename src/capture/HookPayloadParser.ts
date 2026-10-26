export interface ToolAfterPayload {
  readonly kind: "tool.after";
  readonly tool: string;
  readonly sessionID: string;
  readonly callID: string;
  readonly args: Record<string, unknown>;
  readonly exitCode: number | null;
  readonly durationMs: number | null;
}

export interface ToolFailedPayload {
  readonly kind: "tool.failed";
  readonly tool: string;
  readonly sessionID: string;
  readonly callID: string;
  readonly args: Record<string, unknown>;
  readonly error: string;
  readonly durationMs: number | null;
}

export interface SessionStartedPayload {
  readonly kind: "session.started";
  readonly sessionID: string;
  readonly title?: string;
  readonly parentID?: string;
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

export interface UserPromptPayload {
  readonly kind: "user.prompt";
  readonly sessionID: string;
  readonly messageID: string;
  readonly createdAt: string;
  readonly text: string;
  readonly truncated: boolean;
}

export type ParsedHook =
  | ToolAfterPayload
  | ToolFailedPayload
  | SessionStartedPayload
  | SessionIdlePayload
  | CaptureGapPayload
  | UserPromptPayload;

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
    if (hook === "chat.message") {
      return this.parseUserPrompt(payload);
    }
    if (hook === "session.created" || hook === "session.idle") {
      const sessionID = this.asString(payload["sessionID"], "sessionID");
      if (hook === "session.idle") {
        return { kind: "session.idle", sessionID };
      }
      const title = payload["title"];
      // The live parent field is not part of a frozen fixture; a wrong type is dropped, never fatal.
      const parentID = payload["parentID"];
      return {
        kind: "session.started",
        sessionID,
        ...(typeof title === "string" && title.length > 0 ? { title } : {}),
        ...(typeof parentID === "string" && parentID.length > 0 ? { parentID } : {}),
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
      durationMs: this.duration(payload["durationMs"]),
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
      durationMs: this.duration(payload["durationMs"]),
    };
  }

  private parseUserPrompt(payload: Record<string, unknown>): UserPromptPayload {
    const text = this.asString(payload["text"], "text");
    if (text.trim().length === 0) {
      throw new TypeError("text must not be blank");
    }
    const createdAt = this.asString(payload["createdAt"], "createdAt");
    if (!Number.isFinite(Date.parse(createdAt))) {
      throw new TypeError("createdAt must be an ISO 8601 timestamp");
    }
    const truncated = payload["truncated"];
    if (truncated !== undefined && typeof truncated !== "boolean") {
      throw new TypeError("truncated must be a boolean");
    }

    return {
      kind: "user.prompt",
      sessionID: this.asString(payload["sessionID"], "sessionID"),
      messageID: this.asString(payload["messageID"], "messageID"),
      createdAt,
      text,
      truncated: truncated ?? false,
    };
  }

  private duration(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
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
