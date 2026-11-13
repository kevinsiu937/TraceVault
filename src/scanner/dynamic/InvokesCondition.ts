import type { Condition } from "./Condition.js";
import { type ShellCommand, ShellCommandLine } from "./ShellCommandLine.js";

interface Invocation {
  readonly piped: boolean;
  readonly program: RegExp;
  readonly flag: string | null;
}

/**
 * `{ invokes: [entries] }`: the fact is a command line, and one of its
 * commands, as the shell would split it, is a listed invocation. An entry is
 * `program [flag]`, where `*` in the program spans any characters
 * (`python* -c`), and a leading `| ` means the command reads a pipe (`| sh`).
 * A one-letter flag also matches inside a cluster, so `-c` matches `bash -lc`.
 */
export class InvokesCondition implements Condition {
  private constructor(private readonly invocations: readonly Invocation[]) {}

  static parse(argument: unknown): Condition {
    if (!Array.isArray(argument) || argument.length === 0 || !argument.every((item) => typeof item === "string" && item.trim().length > 0)) {
      throw new TypeError("expects a list of invocations such as 'python* -c' or '| sh'");
    }
    return new InvokesCondition((argument as string[]).map((entry) => InvokesCondition.compile(entry)));
  }

  matches(value: string | null): boolean {
    if (value === null) {
      return false;
    }
    const commands = ShellCommandLine.parse(value).commands;
    return commands.some((command) => this.invocations.some((invocation) => InvokesCondition.invokes(command, invocation)));
  }

  private static invokes(command: ShellCommand, invocation: Invocation): boolean {
    if ((invocation.piped && !command.piped) || !invocation.program.test(command.program)) {
      return false;
    }
    const flag = invocation.flag;
    if (flag === null) {
      return true;
    }
    return command.args.some(
      (arg) => arg === flag || arg.startsWith(`${flag}=`) || (/^-[A-Za-z]$/.test(flag) && /^-[A-Za-z]+$/.test(arg) && arg.includes(flag.slice(1))),
    );
  }

  private static compile(entry: string): Invocation {
    const piped = entry.trimStart().startsWith("|");
    const [program = "", flag, ...rest] = entry.trim().replace(/^\|\s*/, "").split(/\s+/);
    if (program === "" || rest.length > 0) {
      throw new TypeError(`'${entry}' must be 'program', 'program flag' or '| program'`);
    }
    const source = program.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return { piped, program: new RegExp(`^${source}$`), flag: flag ?? null };
  }
}
