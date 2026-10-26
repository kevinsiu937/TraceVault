import type { DurationBound } from "../store/EventQuery.js";

/** Parsed form of one expression string. Whitespace separates fragments. */
export interface ParsedExpression {
  /** `kind:<type>` — exact type, or the family before the first dot. */
  readonly kinds: readonly string[];
  readonly outcomes: readonly string[];
  /** Quoted phrases: exact substrings of the target. */
  readonly targetTerms: readonly string[];
  /** `path~<substr>`: case-insensitive target substring. */
  readonly pathTerms: readonly string[];
  /** Bare words: case-insensitive target or event kind substring. */
  readonly words: readonly string[];
  /** `duration:>N`, `duration:>=N`, `duration:<N` — N is milliseconds. */
  readonly durations: readonly DurationBound[];
  /** The expression as typed, for round-tripping into the URL and the chip. */
  readonly text: string;
}

export const NO_EXPRESSION: ParsedExpression = {
  kinds: [],
  outcomes: [],
  targetTerms: [],
  pathTerms: [],
  words: [],
  durations: [],
  text: "",
};

const DURATION_VALUE = /^(>=|>|<)(-?\d+(?:\.\d+)?)$/;

export class FilterExpression {
  parse(expression: string): ParsedExpression {
    const kinds: string[] = [];
    const outcomes: string[] = [];
    const targetTerms: string[] = [];
    const pathTerms: string[] = [];
    const words: string[] = [];
    const durations: DurationBound[] = [];

    for (const token of this.tokens(expression)) {
      if (token.startsWith('"')) {
        const phrase = this.unquote(token);
        if (phrase.length > 0) {
          targetTerms.push(phrase);
        }
        continue;
      }

      const separator = token.search(/[:~=]/);
      const name = separator > 0 ? token.slice(0, separator).toLowerCase() : "";
      const value = separator > 0 ? token.slice(separator + 1) : "";
      const sigil = separator > 0 ? token[separator] : "";

      // An unknown `name:value` fragment is a typo, not a search term.
      if (name.length > 0 && /^[a-z]+$/.test(name)) {
        if (name === "kind" && value.length > 0) {
          kinds.push(value);
        } else if (name === "outcome" && value.length > 0) {
          outcomes.push(value);
        } else if (name === "duration" && value.length > 0) {
          const bound = DURATION_VALUE.exec(value);
          if (bound !== null) {
            durations.push({
              operator: bound[1] as DurationBound["operator"],
              milliseconds: Number(bound[2]),
            });
          }
        } else if (name === "path" && sigil === "~" && value.length > 0) {
          pathTerms.push(value);
        }
        continue;
      }

      if (token.length > 0) {
        words.push(token);
      }
    }

    return {
      kinds: this.unique(kinds),
      outcomes: this.unique(outcomes),
      targetTerms: this.unique(targetTerms),
      pathTerms: this.unique(pathTerms),
      words: this.unique(words),
      durations,
      text: expression.trim(),
    };
  }

  /** Split on whitespace, but keep `"quoted phrases"` as one token. */
  private tokens(expression: string): string[] {
    const tokens: string[] = [];
    let current = "";
    let quoted = false;

    for (const character of expression) {
      if (character === '"') {
        quoted = !quoted;
        current += character;
        continue;
      }
      if (!quoted && /\s/.test(character)) {
        if (current.length > 0) {
          tokens.push(current);
        }
        current = "";
        continue;
      }
      current += character;
    }
    if (current.length > 0) {
      tokens.push(current);
    }
    return tokens;
  }

  private unquote(token: string): string {
    return token.replace(/^"/, "").replace(/"$/, "").trim();
  }

  private unique(values: readonly string[]): string[] {
    return [...new Set(values)];
  }
}
