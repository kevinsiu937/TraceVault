import type { Condition } from "./Condition.js";
import { NormalisedPath } from "./NormalisedPath.js";

/**
 * `{ glob: [patterns] }`: the fact is a path matching any pattern. `**` spans
 * any number of directories (including none), `*` and `?` stay inside one.
 * Patterns and paths are both normalised, so separators and case never matter.
 */
export class GlobCondition implements Condition {
  private constructor(private readonly patterns: readonly RegExp[]) {}

  static parse(argument: unknown): Condition {
    if (
      !Array.isArray(argument) ||
      argument.length === 0 ||
      !argument.every((item) => typeof item === "string" && item.length > 0)
    ) {
      throw new TypeError("expects a list of non-empty glob strings");
    }
    return new GlobCondition((argument as string[]).map((pattern) => GlobCondition.compile(pattern)));
  }

  matches(value: string | null): boolean {
    if (value === null) {
      return false;
    }
    const path = NormalisedPath.of(value).value;
    return this.patterns.some((pattern) => pattern.test(path));
  }

  private static compile(pattern: string): RegExp {
    const segments = NormalisedPath.of(pattern).value.split("/");
    let source = "";
    segments.forEach((segment, index) => {
      const last = index === segments.length - 1;
      if (segment === "**") {
        source += last ? "(?:/.*)?" : "(?:.*/)?";
        return;
      }
      const literal = segment
        .split("")
        .map((character) => {
          if (character === "*") return "[^/]*";
          if (character === "?") return "[^/]";
          return character.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        })
        .join("");
      const previous = segments[index - 1];
      const separator = index === 0 || previous === "**" ? "" : "/";
      source += `${separator}${literal}`;
    });
    return new RegExp(`^${source}$`);
  }
}
