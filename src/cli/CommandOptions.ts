import type { RuleChoice } from "../service/RuleHistoryPort.js";

export type Flag = "--port" | "--db" | "--dir" | "--block" | "--out" | "--undo" | "--rules";

export interface ParsedOptions {
  readonly port: number;
  readonly dbPath: string;
  readonly directory: string;
  readonly block: boolean;
  /** Where a report is written; null when not given. */
  readonly out: string | null;
  readonly undo: boolean;
  /** Which rules a report uses: today's, or those from when the session was recorded. */
  readonly rules: RuleChoice;
}

/** Reads the flags one command accepts; any other flag is an error naming it. */
export class CommandOptions {
  constructor(private readonly defaults: ParsedOptions) {}

  parse(args: readonly string[], accepted: readonly Flag[]): ParsedOptions {
    let { port, dbPath, directory, block, out, undo, rules } = this.defaults;
    const pending = [...args];

    for (let flag = pending.shift(); flag !== undefined; flag = pending.shift()) {
      if (!(accepted as readonly string[]).includes(flag)) {
        throw new TypeError(`unknown option '${flag}'`);
      }
      if (flag === "--block" || flag === "--undo") {
        block ||= flag === "--block";
        undo ||= flag === "--undo";
        continue;
      }
      const value = pending.shift();
      if (flag === "--port") {
        const parsed = value === undefined ? Number.NaN : Number(value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
          throw new TypeError(`--port expects an integer between 0 and 65535, got '${value ?? ""}'`);
        }
        port = parsed;
      } else if (flag === "--rules") {
        if (value !== "now" && value !== "then") {
          throw new TypeError(`--rules expects now or then, got '${value ?? ""}'`);
        }
        rules = value;
      } else if (value === undefined || value === "") {
        throw new TypeError(flag === "--dir" ? "--dir expects a directory path" : `${flag} expects a file path`);
      } else if (flag === "--db") {
        dbPath = value;
      } else if (flag === "--out") {
        out = value;
      } else {
        directory = value;
      }
    }

    return { port, dbPath, directory, block, out, undo, rules };
  }
}
