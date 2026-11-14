import type { Condition } from "./Condition.js";
import { ShellCommandLine } from "./ShellCommandLine.js";
import { ShellScripts } from "./ShellScripts.js";

// Both commands of the line start in the same place, so any root resolves them alike.
const LINE_START = "/line-start";

/**
 * `{ runs_own_write: true }`: the fact is a command line that writes a file
 * and, later in the same line, runs it: `echo … > x.sh && bash x.sh`.
 */
export class RunsOwnWriteCondition implements Condition {
  static parse(argument: unknown): Condition {
    if (argument !== true) {
      throw new TypeError("expects true");
    }
    return new RunsOwnWriteCondition();
  }

  matches(value: string | null): boolean {
    if (value === null) {
      return false;
    }
    const written = new Set<string>();
    for (const command of ShellCommandLine.parse(value).commands) {
      const script = ShellScripts.script(command);
      const ran = script === null ? null : ShellScripts.resolve(LINE_START, command.dir, script);
      if (ran !== null && written.has(ran)) {
        return true;
      }
      for (const file of command.writes) {
        const path = ShellScripts.resolve(LINE_START, command.dir, file);
        if (path !== null) {
          written.add(path);
        }
      }
    }
    return false;
  }
}
