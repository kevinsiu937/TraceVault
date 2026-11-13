import type { Bindings, Condition } from "./Condition.js";
import { NormalisedPath } from "./NormalisedPath.js";
import { type ShellCommand, ShellCommandLine } from "./ShellCommandLine.js";

// Programs that run the file named as their first argument.
const RUNNERS = /^(sh|bash|zsh|dash|ksh|fish|source|\.|python[0-9.]*|node|deno|bun|ruby|perl|php|osascript|pwsh)$/;

/**
 * `{ runs: name }`: the fact is a command line, and one of its commands runs
 * the file an earlier step bound as `name`, either directly (`./build.sh`) or
 * through a shell or interpreter (`bash build.sh`, `python3 tool.py`). A
 * relative path matches the end of the bound path.
 */
export class RunsCondition implements Condition {
  private constructor(private readonly binding: string) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects the name of a file path bound by an earlier step");
    }
    return new RunsCondition(argument);
  }

  matches(value: string | null, bound: Bindings): boolean {
    const file = bound.get(this.binding);
    if (value === null || file === undefined) {
      return false;
    }
    const target = NormalisedPath.of(file).value;
    return ShellCommandLine.parse(value).commands.some((command) => RunsCondition.runs(command, target));
  }

  private static runs(command: ShellCommand, target: string): boolean {
    const script = RUNNERS.test(command.program) ? command.args.find((arg) => !arg.startsWith("-")) : command.path;
    if (script === undefined) {
      return false;
    }
    const path = NormalisedPath.of(script).value.replace(/^\.\//, "");
    return path.length > 0 && (target === path || target.endsWith(`/${path}`));
  }
}
