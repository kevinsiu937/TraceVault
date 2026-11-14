import type { Event } from "../../schema/Event.js";
import type { Finding } from "../../schema/Finding.js";

/** One session's scan, continued an event at a time, so a session that grows is never scanned twice. */
export interface WorkflowScan {
  /** The findings this event completes. Events arrive deduplicated and in timeline order. */
  next(event: Event): Finding[];
}
