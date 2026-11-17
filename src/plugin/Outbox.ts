import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CAP_BYTES = 10 * 1024 * 1024;
// Room kept for the "outbox full" gap that follows a drop, so recording it drops nothing more.
const GAP_ROOM = 1024;

export interface DroppedSpan {
  readonly sessionID: string;
  readonly from: string;
  readonly to: string;
}

interface Entry {
  readonly sessionID: string;
  readonly payload: { readonly observedAt?: string };
}

/**
 * The payloads this plugin process could not deliver, one owner-only file per
 * process: `<pid>-<start>.jsonl`, one payload per line, oldest first. Before
 * sending, a process claims its own file and any file of an exited process by
 * renaming it to `<its id>~<seq>~<name>`, so no two processes send the same one.
 */
export class Outbox {
  private readonly id: string;
  private seq = 0;

  constructor(
    private readonly directory: string,
    private readonly pid: number = process.pid,
    start: number = Date.now(),
    private readonly alive: (pid: number) => boolean = isAlive,
  ) {
    this.id = `${pid}-${start}`;
  }

  /** True while this process holds anything not yet sent. */
  holds(): boolean {
    return this.names().some((name) => this.isMine(name));
  }

  /** Throws when the file cannot be written; returns what had to be dropped to stay under 10 MB. */
  append(sessionID: string, payload: object): DroppedSpan | null {
    const line = `${JSON.stringify({ sessionID, payload })}\n`;
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const size = this.names().reduce((total, name) => total + statSync(join(this.directory, name)).size, 0);
    const dropped = size + Buffer.byteLength(line) > CAP_BYTES ? this.dropOldest(size + Buffer.byteLength(line) + GAP_ROOM - CAP_BYTES) : null;
    appendFileSync(join(this.directory, `${this.id}.jsonl`), line, { mode: 0o600 });
    return dropped;
  }

  /** Sends everything held, oldest first, until it is empty or a send fails; what failed stays. */
  async drain(send: (payload: unknown) => Promise<void>): Promise<boolean> {
    for (let files = this.claim(); files.length > 0; files = this.claim()) {
      for (const file of files) {
        const lines = this.lines(file);
        for (let index = 0; index < lines.length; index += 1) {
          try {
            await send((JSON.parse(lines[index] ?? "") as Entry).payload);
          } catch {
            if (index > 0) {
              this.rewrite(file, lines.slice(index));
            }
            return false;
          }
        }
        rmSync(join(this.directory, file), { force: true });
      }
    }
    return true;
  }

  private dropOldest(excess: number): DroppedSpan | null {
    const dropped: Entry[] = [];
    let freed = 0;
    // Emptying the claimed files lets the next claim take the own file.
    for (let files = this.claim(); files.length > 0 && freed < excess; files = this.claim()) {
      for (const file of files) {
        const lines = this.lines(file);
        let index = 0;
        for (; index < lines.length && freed < excess; index += 1) {
          freed += Buffer.byteLength(`${lines[index]}\n`);
          dropped.push(JSON.parse(lines[index] ?? "") as Entry);
        }
        this.rewrite(file, lines.slice(index));
        if (freed >= excess) {
          break;
        }
      }
    }
    const first = dropped[0];
    const last = dropped.at(-1);
    if (first === undefined || last === undefined) {
      return null;
    }
    return { sessionID: first.sessionID, from: first.payload.observedAt ?? "", to: last.payload.observedAt ?? "" };
  }

  /** Claims this process's file and every exited process's file; returns this process's claimed files, oldest first. */
  private claim(): string[] {
    const own = `${this.id}.jsonl`;
    // While older claimed lines wait, new ones stay in the own file, so an outage leaves two files, not one per send.
    const holding = this.names().some((name) => name.startsWith(`${this.id}~`));
    for (const name of [...this.names().filter((name) => name !== own && !this.isMine(name)).sort(byAge), ...(holding ? [] : [own])]) {
      const pid = Number(/^(\d+)-/.exec(name)?.[1]);
      // A file under this pid but another start time was left by an earlier process that had this pid.
      if (name !== own && pid !== this.pid && this.alive(pid)) {
        continue;
      }
      try {
        renameSync(join(this.directory, name), join(this.directory, `${this.id}~${String(this.seq).padStart(8, "0")}~${name}`));
        this.seq += 1;
      } catch {
        // Another process claimed it first, or there was nothing to claim.
      }
    }
    return this.names().filter((name) => name.startsWith(`${this.id}~`)).sort();
  }

  private isMine(name: string): boolean {
    return name.startsWith(`${this.id}.`) || name.startsWith(`${this.id}~`);
  }

  private names(): string[] {
    try {
      return readdirSync(this.directory).filter((name) => name.endsWith(".jsonl"));
    } catch {
      return [];
    }
  }

  private lines(file: string): string[] {
    try {
      return readFileSync(join(this.directory, file), "utf8").split("\n").filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }

  private rewrite(file: string, lines: readonly string[]): void {
    const path = join(this.directory, file);
    if (lines.length === 0) {
      rmSync(path, { force: true });
      return;
    }
    writeFileSync(`${path}.tmp`, lines.map((line) => `${line}\n`).join(""), { mode: 0o600 });
    renameSync(`${path}.tmp`, path);
  }
}

/** A process's claimed files (`<id>~<seq>~…`) hold older lines than its own `<id>.jsonl`, though "." sorts before "~". */
function byAge(a: string, b: string): number {
  const key = (name: string): string => name.replace(/\.jsonl$/, "\uffff");
  return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else.
    return (error as { code?: string }).code === "EPERM";
  }
}
