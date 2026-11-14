import type { Bindings, Condition } from "./Condition.js";
import { type ShellCommand, ShellCommandLine } from "./ShellCommandLine.js";
import { SESSION_PROJECT, ShellScripts } from "./ShellScripts.js";

interface Written {
  readonly file: string;
  readonly dir: string | null;
}

/**
 * `{ runs: name }`: the fact is a command line that runs a file an earlier
 * step wrote. The binding holds either that file's path (an edit-tool write)
 * or the command line that wrote it (`echo … > x.sh`). Relative paths are
 * resolved against the session's project folder and any `cd` in the line, and
 * the full paths must be equal.
 *
 * `{ runs_by_name: name }` is the fallback for when a full path cannot be
 * worked out (no project folder, or a `cd` the line does not explain): the
 * names match when one ends with the other. A rule offers it as a separate,
 * "probable" alternative.
 */
export class RunsCondition implements Condition {
  private constructor(
    private readonly binding: string,
    private readonly byName: boolean,
  ) {}

  static parse(argument: unknown): Condition {
    return new RunsCondition(RunsCondition.name(argument), false);
  }

  static parseByName(argument: unknown): Condition {
    return new RunsCondition(RunsCondition.name(argument), true);
  }

  matches(value: string | null, bound: Bindings): boolean {
    const recorded = bound.get(this.binding);
    if (value === null || recorded === undefined) {
      return false;
    }
    const root = bound.get(SESSION_PROJECT) ?? null;
    const written = RunsCondition.written(recorded);
    return ShellCommandLine.parse(value).commands.some((command) => written.some((file) => this.runs(command, file, root)));
  }

  private runs(command: ShellCommand, written: Written, root: string | null): boolean {
    const script = ShellScripts.script(command);
    if (script === null) {
      return false;
    }
    const ran = ShellScripts.resolve(root, command.dir, script);
    const wrote = ShellScripts.resolve(root, written.dir, written.file);
    if (ran !== null && wrote !== null) {
      return !this.byName && ran === wrote;
    }
    return this.byName && ShellScripts.sameByName(script, written.file);
  }

  /** The files a recorded write names: a command line's written files, or the recorded value as one path. */
  private static written(recorded: string): readonly Written[] {
    const writes = ShellCommandLine.parse(recorded).commands.flatMap((command) => command.writes.map((file) => ({ file, dir: command.dir })));
    return writes.length > 0 ? writes : [{ file: recorded, dir: "" }];
  }

  private static name(argument: unknown): string {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects the name of a file path bound by an earlier step");
    }
    return argument;
  }
}
