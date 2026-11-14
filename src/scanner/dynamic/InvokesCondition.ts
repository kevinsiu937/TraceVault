import type { Condition } from "./Condition.js";
import { type ShellCommand, ShellCommandLine } from "./ShellCommandLine.js";

interface Invocation {
  /** Matches a command whose program's name is computed (`$X`, `$( … )`), written as the entry "$". */
  readonly computed: boolean;
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
 * A piped entry with no flag matches only when the program runs what it reads:
 * `… | sh` and `… | python3 -` do, `… | python3 tests/menu.py` feeds a script
 * its input and does not (found by the false-positive audit, ticket 63).
 * The entry `$` matches a command whose program's name is computed (`$RUN x`),
 * since the line then does not say what runs.
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
    if (invocation.computed) {
      return command.computed;
    }
    if ((invocation.piped && !command.piped) || command.computed || !invocation.program.test(command.program)) {
      return false;
    }
    const flag = invocation.flag;
    if (flag === null) {
      return !invocation.piped || InvokesCondition.runsStdin(command);
    }
    return command.args.some(
      (arg) => arg === flag || arg.startsWith(`${flag}=`) || (/^-[A-Za-z]$/.test(flag) && /^-[A-Za-z]+$/.test(arg) && arg.includes(flag.slice(1))),
    );
  }

  /** No script file named, or `-`: the program runs the text piped into it. Redirections such as `2>&1` name no script. */
  private static runsStdin(command: ShellCommand): boolean {
    const script = command.args.find((arg) => !arg.startsWith("-") && !/^[0-9]*[<>]/.test(arg));
    return script === undefined;
  }

  private static compile(entry: string): Invocation {
    if (entry.trim() === "$") {
      return { computed: true, piped: false, program: /$^/, flag: null };
    }
    const piped = entry.trimStart().startsWith("|");
    const [program = "", flag, ...rest] = entry.trim().replace(/^\|\s*/, "").split(/\s+/);
    if (program === "" || rest.length > 0) {
      throw new TypeError(`'${entry}' must be 'program', 'program flag' or '| program'`);
    }
    const source = program.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
    return { computed: false, piped, program: new RegExp(`^${source}$`), flag: flag ?? null };
  }
}
