import type { TimelineEntry } from "../service/TimelineEntry.js";

/** Boundaries and capture bookkeeping are never "calls", so they never repeat. */
const NOT_CALLS: ReadonlySet<string> = new Set([
  "session.start",
  "session.end",
  "capture.gap",
  "capture.duplicate",
  "prompt.user",
]);

export type ListItem =
  | { readonly kind: "single"; readonly entry: TimelineEntry }
  | { readonly kind: "repeat"; readonly entries: readonly TimelineEntry[] };

/**
 * Pure derivation for the list: consecutive identical calls — same kind, same
 * target, same operation — become one run of two or more. Every entry stays in
 * exactly one item, in order; nothing is dropped. No storage, no HTML.
 */
export class RepeatedCallGrouper {
  group(entries: readonly TimelineEntry[]): ListItem[] {
    const items: ListItem[] = [];
    let run: TimelineEntry[] = [];

    for (const entry of entries) {
      const last = run[run.length - 1];
      if (last !== undefined && this.identical(last, entry)) {
        run.push(entry);
        continue;
      }
      this.flush(run, items);
      run = [entry];
    }
    this.flush(run, items);

    return items;
  }

  private flush(run: readonly TimelineEntry[], items: ListItem[]): void {
    if (run.length >= 2) {
      items.push({ kind: "repeat", entries: run });
      return;
    }
    for (const entry of run) {
      items.push({ kind: "single", entry });
    }
  }

  private identical(left: TimelineEntry, right: TimelineEntry): boolean {
    return (
      !NOT_CALLS.has(left.type) &&
      left.type === right.type &&
      left.target === right.target &&
      left.operation === right.operation
    );
  }
}
