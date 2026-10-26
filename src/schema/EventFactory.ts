import type { CapturePath } from "./CapturePath.js";
import type { Event } from "./Event.js";
import { EventId } from "./EventId.js";
import type { CaptureDuplicateData } from "./CaptureDuplicateData.js";
import type { CaptureGapData } from "./CaptureGapData.js";
import type { DocumentAccessData } from "./DocumentAccessData.js";
import type { HookScriptData } from "./HookScriptData.js";
import type { McpCallData } from "./McpCallData.js";
import type { SessionLifecycleData } from "./SessionLifecycleData.js";
import type { SkillCallData } from "./SkillCallData.js";
import type { UserPromptData } from "./UserPromptData.js";

export interface EventMeta {
  readonly sessionId: string;
  readonly correlationId: string | null;
  readonly receivedAt: Date;
  readonly agentName?: string;
  readonly title?: string;
  readonly parentSessionId?: string | null;
  readonly durationMs?: number | null;
}

export type ClassifiedTool =
  | { readonly type: "hook.script"; readonly data: HookScriptData }
  | { readonly type: "document.access"; readonly data: DocumentAccessData }
  | { readonly type: "mcp.call"; readonly data: McpCallData }
  | { readonly type: "skill.call"; readonly data: SkillCallData };

export class EventFactory {
  constructor(private readonly capturePath: CapturePath = "plugin_hook") {}

  fromClassified(meta: EventMeta, classified: ClassifiedTool): Event {
    const base = this.envelope(meta);
    switch (classified.type) {
      case "hook.script":
        return { ...base, type: "hook.script", data: classified.data };
      case "document.access":
        return { ...base, type: "document.access", data: classified.data };
      case "mcp.call":
        return { ...base, type: "mcp.call", data: classified.data };
      case "skill.call":
        return { ...base, type: "skill.call", data: classified.data };
    }
  }

  sessionStart(meta: EventMeta): Event {
    const parent = meta.parentSessionId;
    const data: SessionLifecycleData = {
      ...(meta.title === undefined ? {} : { title: meta.title }),
      ...(typeof parent === "string" && parent.length > 0 ? { parent_session_id: parent } : {}),
    };
    return { ...this.envelope(meta), type: "session.start", data };
  }

  sessionEnd(meta: EventMeta): Event {
    const data: SessionLifecycleData = {};
    return { ...this.envelope(meta), type: "session.end", data };
  }

  captureGap(meta: EventMeta, gap: Omit<CaptureGapData, "capture_path">): Event {
    const data: CaptureGapData = { ...gap, capture_path: this.capturePath };
    return { ...this.envelope(meta), type: "capture.gap", data };
  }

  captureDuplicate(meta: EventMeta, ofEventId: string): Event {
    const data: CaptureDuplicateData = { of_event_id: ofEventId, capture_path: this.capturePath };
    return { ...this.envelope(meta), type: "capture.duplicate", data };
  }

  promptUser(meta: EventMeta, data: UserPromptData): Event {
    return { ...this.envelope(meta), type: "prompt.user", data };
  }

  private envelope(meta: EventMeta): Omit<Event, "type" | "data"> {
    return {
      id: EventId.create(meta.receivedAt).toString(),
      schema_version: 1,
      session_id: meta.sessionId,
      agent: { name: meta.agentName ?? "opencode", version: "unknown" },
      capture_path: this.capturePath,
      timestamp: meta.receivedAt.toISOString(),
      seq: null,
      duration_ms: meta.durationMs ?? null,
      correlation_id: meta.correlationId,
      prev_hash: null,
      raw_extra: {},
    };
  }
}
