/**
 * One OpenCode permission pattern, matched the way OpenCode 1.18.32's
 * `Wildcard.match` does: `*` spans anything, newlines included; `?` is one
 * character; a trailing ` *` also allows nothing after the command ("date *"
 * allows "date"); backslashes compare as slashes; everything else is literal
 * and case counts.
 */
export class PermissionPattern {
  private constructor(
    private readonly pattern: RegExp,
    /** The pattern as written, backslashes as slashes, and without a trailing " *" when that may match nothing. */
    private readonly forms: readonly string[],
  ) {}

  static of(pattern: string): PermissionPattern {
    const text = pattern.replaceAll("\\", "/");
    let source = text
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    if (source.endsWith(" .*")) {
      source = `${source.slice(0, -3)}( .*)?`;
    }
    return new PermissionPattern(new RegExp(`^${source}$`, "s"), text.endsWith(" *") ? [text, text.slice(0, -2)] : [text]);
  }

  /** True when some text matches both patterns. */
  overlaps(other: PermissionPattern): boolean {
    return this.forms.some((mine) => other.forms.some((theirs) => PermissionPattern.meet(mine, theirs)));
  }

  allows(command: string): boolean {
    return this.pattern.test(command.replaceAll("\\", "/"));
  }

  private static meet(a: string, b: string): boolean {
    const seen = new Map<number, boolean>();
    const from = (i: number, j: number): boolean => {
      const key = i * (b.length + 1) + j;
      const known = seen.get(key);
      if (known !== undefined) {
        return known;
      }
      let result: boolean;
      if (a[i] === "*") {
        result = from(i + 1, j) || (j < b.length && from(i, j + 1));
      } else if (b[j] === "*") {
        result = from(i, j + 1) || (i < a.length && from(i + 1, j));
      } else if (i === a.length || j === b.length) {
        result = i === a.length && j === b.length;
      } else {
        result = (a[i] === b[j] || a[i] === "?" || b[j] === "?") && from(i + 1, j + 1);
      }
      seen.set(key, result);
      return result;
    };
    return from(0, 0);
  }
}
