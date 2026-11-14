/** The words of one simple command, before they are interpreted, and whether a pipe feeds it. */
export interface RawCommand {
  readonly words: readonly string[];
  readonly piped: boolean;
}

/**
 * Splits a command line into simple commands the way a shell reads it: quotes
 * and escapes honoured; `;`, `&&`, `||`, `|`, `&` and new lines separating
 * commands; `$( … )` and backticks read as commands of their own; here-document
 * bodies skipped, with a `<<` word marking where one was. It never runs anything
 * and does not expand variables or aliases. Redirections stay in the words
 * (`>`, `2>&1`, `<file`), for ShellCommandLine to interpret.
 */
export class ShellWords {
  static split(line: string): RawCommand[] {
    const commands: RawCommand[] = [];
    ShellWords.read(line, commands);
    return commands;
  }

  private static read(line: string, into: RawCommand[]): void {
    let words: string[] = [];
    let word = "";
    let started = false;
    let piped = false;
    const heredocs: string[] = [];
    const endWord = (): void => {
      if (started) {
        words.push(word);
      }
      word = "";
      started = false;
    };
    const endCommand = (nextPiped: boolean): void => {
      endWord();
      if (words.length > 0) {
        into.push({ words, piped });
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
        const close = ShellWords.closingQuote(line, index + 1);
        const inner = line.slice(index + 1, close);
        ShellWords.substitutions(inner, into);
        word += inner.replace(/\\(["\\$`])/g, "$1");
        started = true;
        index = close;
      } else if (character === "$" && next === "(") {
        const close = ShellWords.closingParen(line, index + 2);
        ShellWords.read(line.slice(index + 2, close), into);
        word += line.slice(index, close + 1);
        started = true;
        index = close;
      } else if (character === "`") {
        const close = line.indexOf("`", index + 1);
        const end = close === -1 ? line.length : close;
        ShellWords.read(line.slice(index + 1, end), into);
        word += line.slice(index, end + 1);
        started = true;
        index = end;
      } else if (character === "<" && next === "<" && line[index + 2] !== "<" && line[index - 1] !== "<") {
        endWord();
        words.push("<<");
        const delimiter = /^-?[ \t]*(?:'([^']*)'|"([^"]*)"|([^\s;&|<>()]+))/.exec(line.slice(index + 2));
        heredocs.push(delimiter?.[1] ?? delimiter?.[2] ?? delimiter?.[3] ?? "");
        index += 1 + (delimiter?.[0].length ?? 0);
      } else if (character === "&" && (line[index - 1] === ">" || line[index - 1] === "<" || next === ">")) {
        // `2>&1` and `&>file` are redirections, not a command running in the background.
        word += character;
        started = true;
      } else if (character === "|" && next !== "|") {
        endCommand(true);
      } else if (character === "\n" && heredocs.length > 0) {
        endCommand(false);
        index = ShellWords.skipBodies(line, index + 1, heredocs.splice(0)) - 1;
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

  /** Skips each here-document body in turn, through its delimiter line; returns where the line goes on. */
  private static skipBodies(line: string, from: number, delimiters: readonly string[]): number {
    let index = from;
    for (const delimiter of delimiters) {
      while (index < line.length) {
        const end = line.indexOf("\n", index);
        const stop = end === -1 ? line.length : end;
        const body = line.slice(index, stop);
        index = stop + 1;
        if (body.replace(/^\t+/, "").trimEnd() === delimiter) {
          break;
        }
      }
    }
    return Math.min(index, line.length);
  }

  /** Reads `$( … )` and backticks inside a double-quoted string, which the shell runs too. */
  private static substitutions(text: string, into: RawCommand[]): void {
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "$" && text[index + 1] === "(") {
        const close = ShellWords.closingParen(text, index + 2);
        ShellWords.read(text.slice(index + 2, close), into);
        index = close;
      } else if (text[index] === "`") {
        const close = text.indexOf("`", index + 1);
        const end = close === -1 ? text.length : close;
        ShellWords.read(text.slice(index + 1, end), into);
        index = end;
      }
    }
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
