import type { Event } from "../schema/Event.js";
import type { RuleChoice, RuleHistoryPort, RuleSetScanners, RuleVersions } from "./RuleHistoryPort.js";

/** Picks the scanners for "now" or "then", and says whether the two agree on a session. */
export class SessionRules {
  constructor(
    private readonly now: RuleSetScanners,
    private readonly history: RuleHistoryPort | null,
  ) {}

  remember(sessionId: string): void {
    this.history?.recordSession(sessionId);
  }

  for(sessionId: string, choice: RuleChoice): RuleSetScanners {
    const then = choice === "then" ? this.history?.then(sessionId) : null;
    return then === null || then === undefined || then === "current" ? this.now : then;
  }

  versions(sessionId: string, events: readonly Event[]): RuleVersions {
    const then = this.history?.then(sessionId) ?? null;
    if (then === null) {
      return "unknown";
    }
    return then === "current" || this.verdict(then, events) === this.verdict(this.now, events) ? "same" : "different";
  }

  /** What a rule set concludes about a session, in a form two rule sets can be compared by. */
  private verdict(scanners: RuleSetScanners, events: readonly Event[]): string {
    const workflow = scanners.findings.of(events).map((finding) => `${finding.ruleId}:${finding.eventIds.join(",")}`);
    const config = scanners.configuration.findings(events).map((finding) => `${finding.ruleId}:${finding.subject}`);
    return JSON.stringify([...workflow, ...config].sort());
  }
}
