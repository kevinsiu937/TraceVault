import type { TimelineEntry } from "./TimelineEntry.js";

/** A prompt turn: the prompt that opened it and the visible entries it caused. */
export interface Turn {
  readonly label: string;
  readonly prompt: string | null;
  readonly entries: readonly TimelineEntry[];
}
