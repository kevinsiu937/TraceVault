import type { Condition } from "./Condition.js";
import { GlobCondition } from "./GlobCondition.js";
import { ShellCommandLine } from "./ShellCommandLine.js";

/**
 * `{ writes: [globs] }`: the fact is a command line, and one of its commands
 * writes a file matching a glob, as `glob` matches it: a redirection, `tee`,
 * `curl -o`, `wget -O`, or the destination of `cp`, `mv` or `install`.
 */
export class WritesCondition implements Condition {
  private constructor(private readonly path: Condition) {}

  static parse(argument: unknown): Condition {
    return new WritesCondition(GlobCondition.parse(argument));
  }

  matches(value: string | null): boolean {
    return value !== null && ShellCommandLine.parse(value).commands.some((command) => command.writes.some((file) => this.path.matches(file, new Map())));
  }
}
