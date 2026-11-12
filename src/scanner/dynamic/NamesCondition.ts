import type { Condition } from "./Condition.js";
import { GlobCondition } from "./GlobCondition.js";

// Quotes, shell operators, `=` (--file=x) and `@` (curl -d @file) end a word as well as spaces.
const WORD_BREAK = /[\s'"`;&|<>()=@]+/;

/**
 * `{ names: [globs] }`: the fact is a command line, and one of its words is a
 * path matching a glob, as `glob` matches it. It reads the words, not what the
 * command does, so `cat .env` and `echo hi > .env` both name `.env`.
 */
export class NamesCondition implements Condition {
  private constructor(private readonly path: Condition) {}

  static parse(argument: unknown): Condition {
    return new NamesCondition(GlobCondition.parse(argument));
  }

  matches(value: string | null): boolean {
    return value !== null && value.split(WORD_BREAK).some((word) => word !== "" && this.path.matches(word, new Map()));
  }
}
