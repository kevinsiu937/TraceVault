import { ShellWords } from "./ShellWords.js";

/** One simple command inside a command line, interpreted the way the shell would run it. */
export interface ShellCommand {
  /** The program's file name, without its folder: `/usr/bin/python3` gives `python3`. */
  readonly program: string;
  /** The program as written, before the folder was dropped. */
  readonly path: string;
  /** The arguments, without redirections. */
  readonly args: readonly string[];
  /** True when the command's input comes from the line itself: a pipe, a here-document or a here-string. */
  readonly piped: boolean;
  /** True when the program's name is computed (`$X`, `$( … )`, backticks), so the line does not say what runs. */
  readonly computed: boolean;
  /** Files the command writes: redirection targets, `tee`, `curl -o`, `wget -O`, the destination of `cp`, `mv`, `install`. */
  readonly writes: readonly string[];
  /** A file fed to the command with `<`, or null. */
  readonly input: string | null;
  /**
   * Where earlier `cd`s in the same line moved the command, relative to where
   * the line started ("" when none did), or null when a `cd` went somewhere the
   * line does not say (`cd`, `cd -`, `cd ~`, `cd $X`).
   */
  readonly dir: string | null;
}

// Words that run the command after them rather than being the command, each with its flags that take a value.
const WRAPPERS: Readonly<Record<string, ReadonlySet<string>>> = {
  sudo: new Set(["-u", "-g", "-C", "-h", "-p", "-U", "-r", "-t", "-D"]),
  doas: new Set(["-u", "-C"]),
  env: new Set(["-u", "-C", "-S"]),
  nice: new Set(["-n"]),
  timeout: new Set(["-s", "-k", "--signal", "--kill-after"]),
  time: new Set(["-o", "-f"]),
  command: new Set(),
  exec: new Set(["-a"]),
  nohup: new Set(),
};
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const OUTPUT = /^(?:\d*|&)>>?(.*)$/s;
const INPUT = /^\d*<(.*)$/s;

/**
 * A shell command line read the way a shell reads it (ShellWords splits it),
 * with each command's program, arguments, input and written files worked out.
 * It reads only what is written: no variables, aliases or globs are expanded.
 */
export class ShellCommandLine {
  private constructor(readonly commands: readonly ShellCommand[]) {}

  static parse(line: string): ShellCommandLine {
    const commands: ShellCommand[] = [];
    let dir: string | null = "";
    for (const raw of ShellWords.split(line)) {
      const command = ShellCommandLine.command(raw.words, raw.piped, dir);
      if (command === null) {
        continue;
      }
      commands.push(command);
      if (command.program === "cd" || command.program === "pushd") {
        dir = ShellCommandLine.cd(dir, command.args.find((arg) => !arg.startsWith("-") || arg === "-"));
      }
    }
    return new ShellCommandLine(commands);
  }

  // shortcut: a `cd` inside a subshell `( … )` is treated as if it changed the rest of the line too; scope it if a rule needs that.
  private static cd(dir: string | null, target: string | undefined): string | null {
    if (dir === null || target === undefined || target === "-" || target.startsWith("~") || target.includes("$") || target.includes("`")) {
      return null;
    }
    return target.startsWith("/") || dir === "" ? target : `${dir}/${target}`;
  }

  private static command(words: readonly string[], piped: boolean, dir: string | null): ShellCommand | null {
    let index = ShellCommandLine.programIndex(words);
    const path = words[index];
    if (path === undefined || path === "") {
      return null;
    }
    const args: string[] = [];
    const writes: string[] = [];
    let input: string | null = null;
    let inline = false;
    for (index += 1; index < words.length; index += 1) {
      const word = words[index] ?? "";
      if (word === "<<" || word.startsWith("<<<")) {
        inline = true;
        index += word === "<<<" ? 1 : 0;
        continue;
      }
      const output = OUTPUT.exec(word);
      const redirected = output ?? INPUT.exec(word);
      if (redirected !== null) {
        const target = redirected[1] !== "" ? redirected[1] : words[(index += 1)];
        if (output !== null && target !== undefined && !target.startsWith("&") && target !== "/dev/null") {
          writes.push(target);
        } else if (output === null && target !== undefined && !target.startsWith("(")) {
          input = target;
        }
        continue;
      }
      args.push(word);
    }
    const program = path.slice(path.lastIndexOf("/") + 1);
    writes.push(...ShellCommandLine.programWrites(program, args));
    const computed = path.startsWith("$") || path.includes("`");
    return { program, path, args, piped: piped || inline, computed, writes, input, dir };
  }

  /** Skips `VAR=value` words and wrappers such as `sudo -u root` or `timeout 5`, to the word that names the program. */
  private static programIndex(words: readonly string[]): number {
    let index = 0;
    while (index < words.length) {
      const word = words[index] ?? "";
      const flags = Object.hasOwn(WRAPPERS, word) ? WRAPPERS[word] : undefined;
      if (ASSIGNMENT.test(word)) {
        index += 1;
      } else if (flags !== undefined) {
        index += 1;
        while ((words[index] ?? "").startsWith("-")) {
          const flag = words[index] ?? "";
          index += flags.has(flag) ? 2 : 1;
          if (flag === "--") {
            break;
          }
        }
        if (word === "timeout") {
          index += 1;
        }
      } else {
        break;
      }
    }
    return index;
  }

  private static programWrites(program: string, args: readonly string[]): string[] {
    const operands = args.filter((arg) => !arg.startsWith("-"));
    switch (program) {
      case "tee":
        return operands;
      case "cp":
      case "mv":
      case "install":
        return operands.length >= 2 ? [operands[operands.length - 1] ?? ""] : [];
      case "curl":
        return ShellCommandLine.flagValues(args, ["-o", "--output"]);
      case "wget":
        return ShellCommandLine.flagValues(args, ["-O", "--output-document"]);
      default:
        return [];
    }
  }

  /** The values of `-o file`, `-ofile` and `--output=file`. */
  private static flagValues(args: readonly string[], flags: readonly string[]): string[] {
    const values: string[] = [];
    args.forEach((arg, index) => {
      for (const flag of flags) {
        if (arg === flag && args[index + 1] !== undefined) {
          values.push(args[index + 1] ?? "");
        } else if (flag.startsWith("--") && arg.startsWith(`${flag}=`)) {
          values.push(arg.slice(flag.length + 1));
        } else if (!flag.startsWith("--") && arg.startsWith(flag) && arg.length > flag.length) {
          values.push(arg.slice(flag.length));
        }
      }
    });
    return values.filter((value) => value !== "" && value !== "-" && value !== "/dev/null");
  }
}
