import type { TimelineEntry } from "../service/TimelineEntry.js";

export interface FileTouch {
  readonly eventId: string;
  readonly time: string;
  readonly operation: string;
}

export interface FileTouchGroup {
  readonly path: string;
  readonly count: number;
  readonly refs: readonly FileTouch[];
}

/**
 * Pure derivation from a session timeline: document.access targets grouped into
 * files, busiest first. No storage, no HTML — the rail only draws this.
 */
export class FileRailIndex {
  build(entries: readonly TimelineEntry[]): FileTouchGroup[] {
    const byPath = new Map<string, FileTouch[]>();
    for (const entry of entries) {
      if (entry.type !== "document.access") {
        continue;
      }
      const refs = byPath.get(entry.target) ?? [];
      refs.push({
        eventId: entry.eventId,
        time: entry.time,
        operation: entry.operation ?? "access",
      });
      byPath.set(entry.target, refs);
    }

    return [...byPath.entries()]
      .map(([path, refs]) => ({
        path,
        count: refs.length,
        refs: [...refs].sort((left, right) =>
          left.time < right.time ? -1 : left.time > right.time ? 1 : 0,
        ),
      }))
      .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path));
  }
}
