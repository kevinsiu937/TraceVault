import type { TimelineEntry } from "../service/TimelineEntry.js";

export interface KindRunNode {
  readonly kind: string;
  readonly count: number;
  readonly errorCount: number;
  readonly firstEventId: string;
  readonly firstTime: string;
}

/**
 * Pure derivation from a session timeline: consecutive entries of the same
 * kind collapse into one run. No storage, no HTML — the graph only draws this.
 */
export class KindRunAggregator {
  aggregate(entries: readonly TimelineEntry[]): KindRunNode[] {
    const nodes: KindRunNode[] = [];

    for (const entry of entries) {
      const error = entry.outcome === "error" ? 1 : 0;
      const last = nodes[nodes.length - 1];
      if (last !== undefined && last.kind === entry.type) {
        nodes[nodes.length - 1] = {
          ...last,
          count: last.count + 1,
          errorCount: last.errorCount + error,
        };
      } else {
        nodes.push({
          kind: entry.type,
          count: 1,
          errorCount: error,
          firstEventId: entry.eventId,
          firstTime: entry.time,
        });
      }
    }

    return nodes;
  }
}
