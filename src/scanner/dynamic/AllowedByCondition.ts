import type { Bindings, Condition } from "./Condition.js";
import { PermissionPattern } from "../rules/PermissionPattern.js";
import { ShellCommandLine } from "./ShellCommandLine.js";

// OpenCode 1.18.32 never asks about these, so they need no pattern.
const NEVER_ASKED = new Set(["cd", "chdir", "popd", "pushd"]);

/**
 * `{ allowed_by: name }`: the fact is a command line that the permission
 * patterns an earlier step bound as `name` allow, judged as OpenCode judges it:
 * each command of the line on its own, as written, and the line allowed only
 * when every command is. The bound value holds one pattern per line.
 */
export class AllowedByCondition implements Condition {
  private constructor(private readonly binding: string) {}

  static parse(argument: unknown): Condition {
    if (typeof argument !== "string" || argument.length === 0) {
      throw new TypeError("expects the name of permission patterns bound by an earlier step");
    }
    return new AllowedByCondition(argument);
  }

  matches(value: string | null, bound: Bindings): boolean {
    const patterns = bound.get(this.binding)?.split("\n").map((pattern) => PermissionPattern.of(pattern));
    if (value === null || patterns === undefined) {
      return false;
    }
    const asked = ShellCommandLine.parse(value).commands.filter((command) => !NEVER_ASKED.has(command.path));
    return asked.length > 0 && asked.every((command) => patterns.some((pattern) => pattern.allows(command.text)));
  }
}
