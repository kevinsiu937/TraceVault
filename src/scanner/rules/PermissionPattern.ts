/**
 * One OpenCode permission pattern, matched the way OpenCode 1.18.32's
 * `Wildcard.match` does: `*` spans anything, newlines included; `?` is one
 * character; a trailing ` *` also allows nothing after the command ("date *"
 * allows "date"); backslashes compare as slashes; everything else is literal
 * and case counts.
 */
export class PermissionPattern {
  private constructor(private readonly pattern: RegExp) {}

  static of(pattern: string): PermissionPattern {
    let source = pattern
      .replaceAll("\\", "/")
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    if (source.endsWith(" .*")) {
      source = `${source.slice(0, -3)}( .*)?`;
    }
    return new PermissionPattern(new RegExp(`^${source}$`, "s"));
  }

  allows(command: string): boolean {
    return this.pattern.test(command.replaceAll("\\", "/"));
  }
}
