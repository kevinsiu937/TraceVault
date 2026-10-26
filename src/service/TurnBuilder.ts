import type { TimelineEntry } from "./TimelineEntry.js";
import type { Turn } from "./Turn.js";

interface MutableTurn {
  readonly label: string;
  readonly prompt: string | null;
  readonly entries: TimelineEntry[];
}

/**
 * Groups the visible timeline into turns. Boundaries are real user prompts;
 * harness-injected prompts (the agent's own prompt blocks) never start a turn
 * and are not shown at all. Pure: no clock, no store.
 */
export class TurnBuilder {
  build(
    allEntries: readonly TimelineEntry[],
    visibleEntries: readonly TimelineEntry[],
    filterActive: boolean,
  ): Turn[] {
    const visible = visibleEntries.filter((entry) => !this.isHarnessPrompt(entry));

    if (filterActive) {
      return [{ label: "Filtered events", prompt: null, entries: visible }];
    }

    const turns = this.turns(allEntries);
    if (turns.length === 0) {
      return [{ label: "Full run", prompt: null, entries: visible }];
    }

    const turnOf = this.turnOf(allEntries);
    for (const entry of visible) {
      // Entries before the first prompt (the session start) join the first turn.
      const index = turnOf.get(entry.eventId) ?? 0;
      turns[index]?.entries.push(entry);
    }
    return turns;
  }

  private turns(allEntries: readonly TimelineEntry[]): MutableTurn[] {
    return allEntries
      .filter((entry) => this.isKeptPrompt(entry))
      .map((entry) => ({ label: entry.target, prompt: entry.target, entries: [] }));
  }

  private turnOf(allEntries: readonly TimelineEntry[]): Map<string, number> {
    const turnOf = new Map<string, number>();
    let index = -1;
    for (const entry of allEntries) {
      if (this.isKeptPrompt(entry)) {
        index += 1;
      }
      if (index >= 0) {
        turnOf.set(entry.eventId, index);
      }
    }
    return turnOf;
  }

  private isKeptPrompt(entry: TimelineEntry): boolean {
    return entry.type === "prompt.user" && !this.isHarnessInjected(entry.target);
  }

  private isHarnessPrompt(entry: TimelineEntry): boolean {
    return entry.type === "prompt.user" && this.isHarnessInjected(entry.target);
  }

  /**
   * The agent injects its own prompts (the measured <available-skills> block).
   * They open with a tag and close within the first 200 characters.
   */
  private isHarnessInjected(text: string): boolean {
    return text.startsWith("<") && text.slice(0, 200).includes("</");
  }
}
