import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PendingGap {
  readonly sessionID: string;
  readonly from: string;
  readonly lastFailureAt: string;
}

export class PendingGapStore {
  private readonly statePath: string;

  constructor(statePath: string) {
    this.statePath = statePath;
  }

  load(): PendingGap[] {
    // A leftover `.tmp` means a previous write died between write and rename.
    return this.read(this.statePath) ?? this.read(`${this.statePath}.tmp`) ?? [];
  }

  record(sessionID: string, at: Date): void {
    const gaps = this.load();
    const atIso = at.toISOString();
    const existing = gaps.find((gap) => gap.sessionID === sessionID);
    const next: PendingGap[] =
      existing === undefined
        ? [...gaps, { sessionID, from: atIso, lastFailureAt: atIso }]
        : gaps.map((gap) => (gap.sessionID === sessionID ? { ...gap, lastFailureAt: atIso } : gap));
    this.write(next);
  }

  remove(sessionIDs: readonly string[]): void {
    const removed = new Set(sessionIDs);
    this.write(this.load().filter((gap) => !removed.has(gap.sessionID)));
  }

  clear(): void {
    this.write([]);
  }

  private read(path: string): PendingGap[] | null {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      return Array.isArray(parsed) ? parsed.filter(isPendingGap) : null;
    } catch {
      return null;
    }
  }

  private write(gaps: readonly PendingGap[]): void {
    const json = JSON.stringify(gaps);
    try {
      mkdirSync(dirname(this.statePath), { recursive: true });
      const temporary = `${this.statePath}.tmp`;
      writeFileSync(temporary, json, "utf8");
      renameSync(temporary, this.statePath);
    } catch {
      // Rename can fail on Windows while another handle holds the target.
      try {
        writeFileSync(this.statePath, json, "utf8");
        rmSync(`${this.statePath}.tmp`, { force: true });
      } catch {
        // Bookkeeping must never break the agent's tool call.
      }
    }
  }
}

function isPendingGap(value: unknown): value is PendingGap {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["sessionID"] === "string" &&
    typeof record["from"] === "string" &&
    typeof record["lastFailureAt"] === "string"
  );
}
