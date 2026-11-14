import { NormalisedPath } from "./NormalisedPath.js";
import type { ShellCommand } from "./ShellCommandLine.js";

// Programs that run the file named as their first argument, or fed to them with `<`.
const RUNNERS = /^(sh|bash|zsh|dash|ksh|fish|source|\.|python[0-9.]*|node|deno|bun|ruby|perl|php|osascript|pwsh)$/;

/** The binding every rule match starts with: the session's project folder, from its session.start. */
export const SESSION_PROJECT = "session.project";

/** Which file a command runs, and how two file names written in different places compare. */
export class ShellScripts {
  /** The file the command runs: `bash x.sh`, `python3 x.py`, `sh < x.sh`, `./x.sh`; null when it runs no file. */
  static script(command: ShellCommand): string | null {
    if (RUNNERS.test(command.program)) {
      return command.args.find((arg) => !arg.startsWith("-")) ?? command.input;
    }
    // A shell runs a bare name from PATH, never from the current folder, so only a path counts.
    return command.path.includes("/") ? command.path : null;
  }

  /**
   * The full path of `file`, written in a command that ran in `dir` (relative
   * to where its line started), with the line starting in `root`. Null when
   * the line does not say where it ran.
   */
  static resolve(root: string | null, dir: string | null, file: string): string | null {
    if (ShellScripts.absolute(file)) {
      return NormalisedPath.of(file).value;
    }
    if (dir === null) {
      return null;
    }
    const inDir = dir === "" ? file : `${dir}/${file}`;
    if (ShellScripts.absolute(inDir)) {
      return NormalisedPath.of(inDir).value;
    }
    return root === null ? null : NormalisedPath.of(`${root}/${inDir}`).value;
  }

  /** True when one name is the other, or ends with it as a whole path segment. */
  static sameByName(left: string, right: string): boolean {
    const a = NormalisedPath.of(left).value;
    const b = NormalisedPath.of(right).value;
    return a.length > 0 && b.length > 0 && (a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`));
  }

  private static absolute(path: string): boolean {
    return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
  }
}
