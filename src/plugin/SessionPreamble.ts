import { ConfigRedactor } from "./ConfigRedactor.js";

/**
 * What this OpenCode process knows before any session exists, sent into each
 * session the first time the process sees it. OpenCode calls the config hook
 * once, when it loads the plugin (read from the 1.18.32 bundle), so a resumed
 * session in a new process receives that process's configuration.
 */
export class SessionPreamble {
  private payload: Record<string, unknown> | null = null;
  private readonly delivered = new Set<string>();

  constructor(
    private readonly redactor: ConfigRedactor = new ConfigRedactor(),
    private readonly clock: () => Date = () => new Date(),
  ) {}

  configure(config: unknown): void {
    try {
      this.payload = { hook: "config.snapshot", config: this.redactor.redact(config) };
    } catch (error) {
      const at = this.clock().toISOString();
      const reason = error instanceof Error ? error.message : String(error);
      this.payload = { hook: "capture.gap", from: at, to: at, reason: `configuration could not be recorded: ${reason}` };
    }
  }

  /** The payloads to send before this session's next one; empty once they got through. */
  for(sessionID: string): unknown[] {
    return this.payload === null || this.delivered.has(sessionID) ? [] : [{ ...this.payload, sessionID }];
  }

  sent(sessionID: string): void {
    this.delivered.add(sessionID);
  }
}
