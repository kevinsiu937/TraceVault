import { TurnBuilder } from "../service/TurnBuilder.js";
import type { TimelineEntry } from "../service/TimelineEntry.js";
import type { Turn } from "../service/Turn.js";
import type { SessionRenderContext } from "./SessionRenderContext.js";

export type ReplayTurnState = "past" | "active" | "future" | "none";

export interface ReplayTurnSpan {
  readonly turn: Turn;
  readonly startMs: number;
  readonly endMs: number;
  readonly state: ReplayTurnState;
}

export type ReplayMomentKind = "error" | "denied" | "gap";

export interface ReplayMoment {
  readonly kind: ReplayMomentKind;
  readonly offsetMs: number;
  readonly target: string;
}

/**
 * Where a session sits on its own replay clock. `t` is an offset in
 * milliseconds from the first stored event; turns before it are past, the turn
 * containing it is active, later turns are future. Pure: no clock, no store.
 */
export class ReplayTimeline {
  private constructor(
    readonly usable: boolean,
    readonly turns: readonly ReplayTurnSpan[],
    readonly moments: readonly ReplayMoment[],
    readonly totalMs: number,
    readonly positionMs: number | null,
  ) {}

  static from(context: SessionRenderContext, turnBuilder = new TurnBuilder()): ReplayTimeline {
    const built = turnBuilder.build(context.allEntries, context.entries, context.filter.active);
    // "Full run" and "Filtered events" are single groups, not replayable turns.
    const usable = built.some((turn) => turn.prompt !== null);
    const start = ReplayTimeline.earliest(context.allEntries);
    const totalMs = Math.max(0, ReplayTimeline.latest(context.allEntries) - start);
    const positionMs = usable ? ReplayTimeline.position(context.state.t, totalMs) : null;
    const spans = ReplayTimeline.spans(built, start, totalMs, positionMs);

    return new ReplayTimeline(
      usable,
      spans,
      usable ? ReplayTimeline.moments(context.allEntries, start, totalMs) : [],
      totalMs,
      positionMs,
    );
  }

  percent(offsetMs: number): number {
    if (this.totalMs === 0) {
      return 0;
    }
    return (Math.max(0, Math.min(this.totalMs, offsetMs)) / this.totalMs) * 100;
  }

  private static spans(
    turns: readonly Turn[],
    start: number,
    totalMs: number,
    positionMs: number | null,
  ): ReplayTurnSpan[] {
    const starts = turns.map((turn) =>
      ReplayTimeline.offset(turn.entries[0]?.time, start, totalMs),
    );
    const active = ReplayTimeline.activeIndex(starts, positionMs);

    return turns.map((turn, index) => {
      let state: ReplayTurnState = "none";
      if (positionMs !== null) {
        state = index < active ? "past" : index === active ? "active" : "future";
      }
      return {
        turn,
        startMs: starts[index] ?? 0,
        endMs: starts[index + 1] ?? totalMs,
        state,
      };
    });
  }

  private static activeIndex(starts: readonly number[], positionMs: number | null): number {
    if (positionMs === null) {
      return -1;
    }
    let active = -1;
    for (const [index, start] of starts.entries()) {
      if (start <= positionMs) {
        active = index;
      }
    }
    return active < 0 ? 0 : active;
  }

  private static moments(
    entries: readonly TimelineEntry[],
    start: number,
    totalMs: number,
  ): ReplayMoment[] {
    const moments: ReplayMoment[] = [];
    for (const entry of entries) {
      const kind: ReplayMomentKind | null =
        entry.outcome === "error"
          ? "error"
          : entry.outcome === "denied"
            ? "denied"
            : entry.type === "capture.gap"
              ? "gap"
              : null;
      if (kind !== null) {
        moments.push({ kind, offsetMs: ReplayTimeline.offset(entry.time, start, totalMs), target: entry.target });
      }
    }
    return moments;
  }

  private static position(t: string | null, totalMs: number): number | null {
    if (t === null) {
      return null;
    }
    const parsed = Number(t);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return Math.min(totalMs, Math.round(parsed));
  }

  private static offset(time: string | undefined, start: number, totalMs: number): number {
    const parsed = time === undefined ? Number.NaN : Date.parse(time);
    if (!Number.isFinite(parsed)) {
      return 0;
    }
    return Math.max(0, Math.min(totalMs, parsed - start));
  }

  private static earliest(entries: readonly TimelineEntry[]): number {
    let earliest = Number.POSITIVE_INFINITY;
    for (const entry of entries) {
      const parsed = Date.parse(entry.time);
      if (Number.isFinite(parsed)) {
        earliest = Math.min(earliest, parsed);
      }
    }
    return Number.isFinite(earliest) ? earliest : 0;
  }

  private static latest(entries: readonly TimelineEntry[]): number {
    let latest = Number.NEGATIVE_INFINITY;
    for (const entry of entries) {
      const parsed = Date.parse(entry.time);
      if (Number.isFinite(parsed)) {
        latest = Math.max(latest, parsed);
      }
    }
    return Number.isFinite(latest) ? latest : 0;
  }
}
