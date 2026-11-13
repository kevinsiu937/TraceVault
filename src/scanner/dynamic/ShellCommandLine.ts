/** One simple command inside a command line: the program it starts, its arguments, and whether a pipe feeds it. */
export interface ShellCommand {
  /** The program's file name, without its folder: `/usr/bin/python3` gives `python3`. */
  readonly program: string;
  /** The program as written, before the folder was dropped. */
  readonly path: string;
  readonly args: readonly string[];
  /** True when the command reads the output of the command before it (`… | sh`). */
  readonly piped: boolean;
}

// Words that run the command after them rather than being the command. `env` also skips VAR=value words.
const WRAPPERS = new Set(["sudo", "env", "command", "exec", "nohup", "time", "nice", "doas"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * A shell command line split the way a shell reads it: quotes and escapes
 * honoured, and `;`, `&&`, `||`, `|`, `&` and new lines separating commands.
 * Commands inside `$( … )` and backticks are read too. It never runs anything
 * and does not expand variables or aliases, so it reads only what is written.
 */
export class ShellCommandLine {
  private constructor(readonly commands: readonly ShellCommand[]) {}

  static parse(line: string): ShellCommandLine {
    const commands: ShellCommand[] = [];
    ShellCommandLine.read(line, commands);
    return new ShellCommandLine(commands);
  }

  private static read(line: string, into: ShellCommand[]): void {
    let words: string[] = [];
    let word = "";
    let started = false;
    let piped = false;
    const endWord = (): void => {
      if (started) {
        words.push(word);
      }
      word = "";
      started = false;
    };
    const endCommand = (nextPiped: boolean): void => {
      endWord();
      const command = ShellCommandLine.command(words, piped);
      if (command !== null) {
        into.push(command);
      }
      words = [];
      piped = nextPiped;
    };

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index] ?? "";
      const next = line[index + 1] ?? "";
      if (character === "\\" && index + 1 < line.length) {
        word += next;
        started = true;
        index += 1;
      } else if (character === "'") {
        const close = line.indexOf("'", index + 1);
        const end = close === -1 ? line.length : close;
        word += line.slice(index + 1, end);
        started = true;
        index = end;
      } else if (character === '"') {
        const close = ShellCommandLine.closingQuote(line, index + 1);
        const inner = line.slice(index + 1, close);
        ShellCommandLine.substitutions(inner, into);
        word += inner.replace(/\\(["\\$`])/g, "$1");
        started = true;
        index = close;
      } else if (character === "$" && next === "(") {
        const close = ShellCommandLine.closingParen(line, index + 2);
        ShellCommandLine.read(line.slice(index + 2, close), into);
        word += line.slice(index, close + 1);
        started = true;
        index = close;
      } else if (character === "`") {
        const close = line.indexOf("`", index + 1);
        const end = close === -1 ? line.length : close;
        ShellCommandLine.read(line.slice(index + 1, end), into);
        word += line.slice(index, end + 1);
        started = true;
        index = end;
      } else if (character === "&" && (line[index - 1] === ">" || line[index - 1] === "<" || next === ">")) {
        // `2>&1` and `&>file` are redirections, not a command running in the background.
        word += character;
        started = true;
      } else if (character === "|" && next !== "|") {
        endCommand(true);
      } else if (character === ";" || character === "\n" || character === "&" || character === "|") {
        endCommand(false);
        if (next === character) {
          index += 1;
        }
      } else if (character === "(" || character === ")") {
        endCommand(false);
      } else if (/\s/.test(character)) {
        endWord();
      } else {
        word += character;
        started = true;
      }
    }
    endCommand(false);
  }

  /** Reads `$( … )` and backticks inside a double-quoted string, which the shell runs too. */
  private static substitutions(text: string, into: ShellCommand[]): void {
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "$" && text[index + 1] === "(") {
        const close = ShellCommandLine.closingParen(text, index + 2);
        ShellCommandLine.read(text.slice(index + 2, close), into);
        index = close;
      } else if (text[index] === "`") {
        const close = text.indexOf("`", index + 1);
        const end = close === -1 ? text.length : close;
        ShellCommandLine.read(text.slice(index + 1, end), into);
        index = end;
      }
    }
  }

  private static command(words: readonly string[], piped: boolean): ShellCommand | null {
    let start = 0;
    while (start < words.length) {
      const current = words[start] ?? "";
      if (ASSIGNMENT.test(current) || WRAPPERS.has(current) || (start > 0 && WRAPPERS.has(words[start - 1] ?? "") && current.startsWith("-"))) {
        start += 1;
      } else {
        break;
      }
    }
    const path = words[start];
    if (path === undefined || path === "") {
      return null;
    }
    return { program: path.slice(path.lastIndexOf("/") + 1), path, args: words.slice(start + 1), piped };
  }

  private static closingQuote(line: string, from: number): number {
    for (let index = from; index < line.length; index += 1) {
      if (line[index] === "\\") {
        index += 1;
      } else if (line[index] === '"') {
        return index;
      }
    }
    return line.length;
  }

  private static closingParen(line: string, from: number): number {
    let depth = 1;
    for (let index = from; index < line.length; index += 1) {
      if (line[index] === "(") {
        depth += 1;
      } else if (line[index] === ")") {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }
    return line.length;
  }
}
