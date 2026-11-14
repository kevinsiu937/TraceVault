import type { Event } from "../schema/Event.js";
import type { Finding } from "../schema/Finding.js";
import type { WorkflowScan } from "../scanner/dynamic/WorkflowScan.js";
import type { WorkflowScannerPort } from "../scanner/dynamic/WorkflowScannerPort.js";
import { DistinctEvents } from "./DistinctEvents.js";
import type { TimelineEntry } from "./TimelineEntry.js";

const NO_RULES: WorkflowScannerPort = { scan: () => [], begin: () => ({ next: () => [] }), blockedBy: () => null };
// Enough for the pages one person has open; each entry is one session's scan so far.
const RECENT_SESSIONS = 16;

interface Scanned {
  readonly scan: WorkflowScan;
  /** The calls already fed, for dropping a second record of one. */
  readonly seen: Set<string>;
  /** How many of the session's events have been fed, and the last of them. */
  readonly count: number;
  readonly lastId: string;
  readonly findings: Finding[];
}

/**
 * Findings for one session, and the flags they put on its timeline rows.
 * Always computed over the whole deduplicated session, so a filtered view
 * shows the same flags on the rows it keeps.
 */
export class SessionFindings {
  /** The last few sessions scanned, each as far as it had grown. */
  private readonly recent = new Map<string, Scanned>();

  constructor(
    private readonly scanner: WorkflowScannerPort = NO_RULES,
    private readonly distinct: DistinctEvents = new DistinctEvents(),
  ) {}

  /**
   * A session that only grew at its end is continued from where its scan stopped,
   * so a new event costs one step however long the session is. Anything else,
   * such as an event that sorts before ones already fed, starts the scan again.
   */
  of(session: readonly Event[]): Finding[] {
    const last = session[session.length - 1];
    if (last === undefined) {
      return [];
    }
    const known = this.recent.get(last.session_id);
    const continues = known !== undefined && session.length >= known.count && session[known.count - 1]?.id === known.lastId;
    const from: Scanned = continues ? known : { scan: this.scanner.begin(), seen: new Set(), count: 0, lastId: "", findings: [] };
    // Out before feeding: a scan that throws half way must not be continued.
    this.recent.delete(last.session_id);

    const added = this.distinct.of(session.slice(from.count), from.seen).flatMap((event) => from.scan.next(event));
    const findings = added.length === 0 ? from.findings : [...from.findings, ...added];
    this.recent.set(last.session_id, { ...from, count: session.length, lastId: last.id, findings });
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
