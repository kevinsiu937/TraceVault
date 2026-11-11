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
  readonly blockedBy?: string;
}

export interface SessionStartedPayload {
  readonly kind: "session.started";
  readonly sessionID: string;
  readonly title?: string;
  readonly parentID?: string;
  readonly directory?: string;
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

export interface PermissionGrantedPayload {
  readonly kind: "permission.granted";
  readonly sessionID: string;
  readonly requestID: string;
  readonly permission: string;
  readonly patterns: readonly string[];
  readonly reply: "once" | "always";
  readonly callID?: string;
}

export interface GuardFailurePayload {
  readonly kind: "guard.failure";
  readonly sessionID: string;
  readonly callID: string;
  readonly tool: string;
  readonly reason: string;
}

export interface ConfigSnapshotPayload {
  readonly kind: "config.snapshot";
  readonly sessionID: string;
  readonly config: Record<string, unknown>;
}

export interface McpToolsPayload {
  readonly kind: "mcp.tools";
  readonly sessionID: string;
  readonly server: string;
  readonly tools: readonly Record<string, unknown>[];
}

export type ParsedHook =
  | ToolAfterPayload
  | ToolFailedPayload
  | SessionStartedPayload
  | SessionIdlePayload
  | CaptureGapPayload
  | UserPromptPayload
  | PermissionGrantedPayload
  | GuardFailurePayload
  | ConfigSnapshotPayload
  | McpToolsPayload;

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
    if (hook === "permission.granted") {
      return this.parseGrant(payload);
    }
    if (hook === "guard.failure") {
      return {
        kind: "guard.failure",
        sessionID: this.asString(payload["sessionID"], "sessionID"),
        callID: this.asString(payload["callID"], "callID"),
        tool: this.asString(payload["tool"], "tool"),
        reason: this.asString(payload["reason"], "reason"),
      };
    }
    if (hook === "config.snapshot") {
      return {
        kind: "config.snapshot",
        sessionID: this.asString(payload["sessionID"], "sessionID"),
        config: this.asRecord(payload["config"], "config"),
      };
    }
    if (hook === "mcp.tools") {
      const tools = payload["tools"];
      if (!Array.isArray(tools)) {
        throw new TypeError("tools must be a list");
      }
      return {
        kind: "mcp.tools",
        sessionID: this.asString(payload["sessionID"], "sessionID"),
        server: this.asString(payload["server"], "server"),
        tools: tools.map((tool, index) => {
          const record = this.asRecord(tool, `tools[${index}]`);
          this.asString(record["name"], `tools[${index}].name`);
          return record;
        }),
      };
    }
    if (hook === "session.created" || hook === "session.idle") {
      const sessionID = this.asString(payload["sessionID"], "sessionID");
      if (hook === "session.idle") {
        return { kind: "session.idle", sessionID };
      }
      const title = payload["title"];
      // The live parent field is not part of a frozen fixture; a wrong type is dropped, never fatal.
      const parentID = payload["parentID"];
      const directory = payload["directory"];
      return {
        kind: "session.started",
        sessionID,
        ...(typeof title === "string" && title.length > 0 ? { title } : {}),
        ...(typeof parentID === "string" && parentID.length > 0 ? { parentID } : {}),
        ...(typeof directory === "string" && directory.length > 0 ? { directory } : {}),
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
      ...(payload["blockedBy"] === undefined ? {} : { blockedBy: this.asString(payload["blockedBy"], "blockedBy") }),
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

  private parseGrant(payload: Record<string, unknown>): PermissionGrantedPayload {
    const { reply, patterns, callID } = payload;
    if (reply !== "once" && reply !== "always") {
      throw new TypeError("reply must be once or always");
    }
    if (!Array.isArray(patterns) || patterns.length === 0 || !patterns.every((item) => typeof item === "string" && item.length > 0)) {
      throw new TypeError("patterns must be a non-empty list of strings");
    }
    return {
      kind: "permission.granted",
      sessionID: this.asString(payload["sessionID"], "sessionID"),
      requestID: this.asString(payload["requestID"], "requestID"),
      permission: this.asString(payload["permission"], "permission"),
      patterns: patterns as string[],
      reply,
      ...(typeof callID === "string" && callID.length > 0 ? { callID } : {}),
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
