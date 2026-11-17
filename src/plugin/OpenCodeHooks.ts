import type { PermissionProperties } from "./PermissionRequests.js";
import type { ChatMessageInput, ChatMessageOutput } from "./UserPrompt.js";

/** The shapes of the OpenCode plugin hooks TraceVault uses, as probed. */
export interface ToolExecuteInput {
  tool: string;
  sessionID: string;
  callID: string;
}

export interface ToolExecuteAfterInput extends ToolExecuteInput {
  args: Record<string, unknown>;
}

export interface ToolExecuteBeforeOutput {
  args: Record<string, unknown>;
}

export interface ToolExecuteAfterOutput {
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolPartState {
  status?: string;
  input?: Record<string, unknown>;
  error?: unknown;
}

export interface ToolPart {
  type?: string;
  tool?: string;
  callID?: string;
  sessionID?: string;
  state?: ToolPartState;
}

export interface PluginEvent {
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

export type ToolBefore = (input: ToolExecuteInput, output: ToolExecuteBeforeOutput) => Promise<void>;
export type ToolAfter = (input: ToolExecuteAfterInput, output: ToolExecuteAfterOutput) => Promise<void>;
export type EventHook = (input: { event: PluginEvent }) => Promise<void>;
export type ChatMessage = (input: ChatMessageInput, output: ChatMessageOutput) => Promise<void>;
export type ShellEnv = (input: { cwd?: string; sessionID?: string; callID?: string }, output: { env: Record<string, string> }) => Promise<void>;

export interface TraceVaultHooks {
  config: (config: unknown) => Promise<void>;
  "tool.execute.before": ToolBefore;
  "tool.execute.after": ToolAfter;
  "chat.message": ChatMessage;
  "shell.env": ShellEnv;
  event: EventHook;
}
