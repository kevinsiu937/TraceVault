import type { TimelineEntry } from "../service/TimelineEntry.js";

/** Two or more consecutive identical calls. */
export type RepeatedRun = readonly [TimelineEntry, TimelineEntry, ...TimelineEntry[]];

export type ListItem =
  | { readonly kind: "single"; readonly entry: TimelineEntry }
  | { readonly kind: "repeat"; readonly entries: RepeatedRun };

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
    const [first, second, ...rest] = run;
    if (first !== undefined && second !== undefined) {
      items.push({ kind: "repeat", entries: [first, second, ...rest] });
      return;
    }
    if (first !== undefined) {
      items.push({ kind: "single", entry: first });
    }
  }

  private identical(left: TimelineEntry, right: TimelineEntry): boolean {
    return (
      left.isCall &&
      left.type === right.type &&
      left.target === right.target &&
      left.operation === right.operation
    );
  }
}
