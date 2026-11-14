import type { Event } from "../schema/Event.js";
import type { Finding } from "../schema/Finding.js";
import type { WorkflowScannerPort } from "../scanner/dynamic/WorkflowScannerPort.js";
import { DistinctEvents } from "./DistinctEvents.js";
import type { TimelineEntry } from "./TimelineEntry.js";

const NO_RULES: WorkflowScannerPort = { scan: () => [], blockedBy: () => null };
// Enough for the pages one person has open; each entry is one session's findings.
const RECENT_SESSIONS = 16;

/**
 * Findings for one session, and the flags they put on its timeline rows.
 * Always computed over the whole deduplicated session, so a filtered view
 * shows the same flags on the rows it keeps.
 */
export class SessionFindings {
  /** The last few sessions scanned, by session, event count and last event: an append changes the key. */
  private readonly recent = new Map<string, Finding[]>();

  constructor(
    private readonly scanner: WorkflowScannerPort = NO_RULES,
    private readonly distinct: DistinctEvents = new DistinctEvents(),
  ) {}

  // shortcut: a cache miss still rescans the whole session, and three session-window rules grow with the square of its length (docs/probes/scale-measurements.md); match incrementally when sessions outgrow it.
  of(session: readonly Event[]): Finding[] {
    const last = session[session.length - 1];
    const key = `${last?.session_id ?? ""}\u0000${session.length}\u0000${last?.id ?? ""}`;
    const cached = this.recent.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const findings = this.scanner.scan(this.distinct.of(session));
    this.recent.set(key, findings);
    if (this.recent.size > RECENT_SESSIONS) {
      this.recent.delete(this.recent.keys().next().value ?? "");
    }
    return findings;
  }

  /** The entries, each carrying the rule ids of the findings that name it. */
  flag(entries: readonly TimelineEntry[], session: readonly Event[]): TimelineEntry[] {
    const flags = new Map<string, string[]>();
    for (const finding of this.of(session)) {
      for (const eventId of finding.eventIds) {
        const ruleIds = flags.get(eventId) ?? [];
        if (!ruleIds.includes(finding.ruleId)) {
          ruleIds.push(finding.ruleId);
        }
        flags.set(eventId, ruleIds);
      }
    }
    return entries.map((entry) => {
      const ruleIds = flags.get(entry.eventId);
      return ruleIds === undefined ? entry : { ...entry, flags: ruleIds };
    });
  }
}
