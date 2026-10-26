import type { CaptureDuplicateData } from "./CaptureDuplicateData.js";
import type { CaptureGapData } from "./CaptureGapData.js";
import type { CapturePath } from "./CapturePath.js";
import type { DocumentAccessData } from "./DocumentAccessData.js";
import type { HookScriptData } from "./HookScriptData.js";
import type { McpCallData } from "./McpCallData.js";
import type { SessionLifecycleData } from "./SessionLifecycleData.js";
import type { SkillCallData } from "./SkillCallData.js";
import type { UserPromptData } from "./UserPromptData.js";

export interface AgentIdentity {
  readonly name: string;
  readonly version: string;
}

interface EventEnvelope {
  readonly id: string;
  readonly schema_version: 1;
  readonly session_id: string;
  readonly agent: AgentIdentity;
  readonly capture_path: CapturePath;
  readonly timestamp: string;
  readonly seq: number | null;
  readonly duration_ms: number | null;
  readonly correlation_id: string | null;
  readonly prev_hash: string | null;
  readonly raw_extra: Record<string, unknown>;
}

export type Event = EventEnvelope &
  (
    | { readonly type: "hook.script"; readonly data: HookScriptData }
    | { readonly type: "document.access"; readonly data: DocumentAccessData }
    | { readonly type: "mcp.call"; readonly data: McpCallData }
    | { readonly type: "skill.call"; readonly data: SkillCallData }
    | { readonly type: "session.start"; readonly data: SessionLifecycleData }
    | { readonly type: "session.end"; readonly data: SessionLifecycleData }
    | { readonly type: "capture.gap"; readonly data: CaptureGapData }
    | { readonly type: "capture.duplicate"; readonly data: CaptureDuplicateData }
    | { readonly type: "prompt.user"; readonly data: UserPromptData }
  );
