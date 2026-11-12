export type Flag = "--port" | "--db" | "--dir" | "--block";

export interface ParsedOptions {
  readonly port: number;
  readonly dbPath: string;
  readonly directory: string;
  readonly block: boolean;
}

/** Reads the flags one command accepts; any other flag is an error naming it. */
export class CommandOptions {
  constructor(private readonly defaults: ParsedOptions) {}

  parse(args: readonly string[], accepted: readonly Flag[]): ParsedOptions {
    let { port, dbPath, directory, block } = this.defaults;
    const pending = [...args];

    for (let flag = pending.shift(); flag !== undefined; flag = pending.shift()) {
      if (!(accepted as readonly string[]).includes(flag)) {
        throw new TypeError(`unknown option '${flag}'`);
      }
      if (flag === "--block") {
        block = true;
        continue;
      }
      const value = pending.shift();
      if (flag === "--port") {
        const parsed = value === undefined ? Number.NaN : Number(value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
          throw new TypeError(`--port expects an integer between 0 and 65535, got '${value ?? ""}'`);
        }
        port = parsed;
      } else if (value === undefined || value === "") {
        throw new TypeError(flag === "--db" ? "--db expects a file path" : "--dir expects a directory path");
      } else if (flag === "--db") {
        dbPath = value;
      } else {
        directory = value;
      }
    }

    return { port, dbPath, directory, block };
  }
}
