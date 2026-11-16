import type { TimelineEntry } from "../service/TimelineEntry.js";

/**
 * One page of the timeline's rows. Page 1 holds the oldest rows, so a page
 * keeps its rows as the session grows. Without a page asked for, it is the page
 * holding the selected event, else the newest.
 */
export class TimelinePage {
  private constructor(
    readonly entries: readonly TimelineEntry[],
    readonly number: number,
    readonly count: number,
    /** Where the page's first row sits in the whole timeline. */
    readonly start: number,
  ) {}

  static of(entries: readonly TimelineEntry[], size: number, page: string | null, eventId: string | null): TimelinePage {
    const count = Math.max(1, Math.ceil(entries.length / size));
    const asked = Number(page);
    const holding = eventId === null ? -1 : entries.findIndex((entry) => entry.eventId === eventId);
    const number =
      page !== null && Number.isInteger(asked) && asked >= 1
        ? Math.min(asked, count)
        : holding >= 0
          ? Math.floor(holding / size) + 1
          : count;
    const start = (number - 1) * size;
    return new TimelinePage(entries.slice(start, start + size), number, count, start);
  }

  get newest(): boolean {
    return this.number === this.count;
  }
}
