export type EventType =
  | "hook.script"
  | "document.access"
  | "mcp.call"
  | "skill.call"
  | "session.start"
  | "session.end"
  | "capture.gap"
  | "capture.duplicate"
  | "prompt.user";
