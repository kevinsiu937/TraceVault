import type { Event } from "../schema/Event.js";
import type { Finding } from "../schema/Finding.js";
import type { WorkflowScannerPort } from "../scanner/dynamic/WorkflowScannerPort.js";
import { DistinctEvents } from "./DistinctEvents.js";
import type { TimelineEntry } from "./TimelineEntry.js";

const NO_RULES: WorkflowScannerPort = { scan: () => [], blockedBy: () => null };

/**
 * Findings for one session, and the flags they put on its timeline rows.
 * Always computed over the whole deduplicated session, so a filtered view
 * shows the same flags on the rows it keeps.
 */
export class SessionFindings {
  constructor(
    private readonly scanner: WorkflowScannerPort = NO_RULES,
    private readonly distinct: DistinctEvents = new DistinctEvents(),
  ) {}

  of(session: readonly Event[]): Finding[] {
    return this.scanner.scan(this.distinct.of(session));
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
