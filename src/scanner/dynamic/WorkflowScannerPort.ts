import type { Event } from "../../schema/Event.js";
import type { Finding } from "../../schema/Finding.js";

export interface WorkflowScannerPort {
  /**
   * Findings for one session. `events` is the deduplicated session in timeline
   * order, the same events the page renders, and always the whole session:
   * a filtered view must not change what the rules see.
   */
  scan(events: readonly Event[]): Finding[];
}
