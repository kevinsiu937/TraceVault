/** How a flag is read: a switch takes no value; the others take the next argument and check it. */
export type FlagKind = "switch" | "port" | "days" | "rules" | "file" | "directory";

/** Reads the flags one command accepts; any other flag is an error naming it. A switch reads as "". */
export class CommandOptions {
  static parse<F extends string>(args: readonly string[], accepted: Readonly<Record<F, FlagKind>>): Partial<Record<F, string>> {
    const values: Partial<Record<F, string>> = {};
    const pending = [...args];

    for (let flag = pending.shift(); flag !== undefined; flag = pending.shift()) {
      if (!Object.hasOwn(accepted, flag)) {
        throw new TypeError(`unknown option '${flag}'`);
      }
      const kind = accepted[flag as F];
      if (kind === "switch") {
        values[flag as F] = "";
        continue;
      }
      const value = pending.shift();
      if (kind === "port") {
        const parsed = value === undefined ? Number.NaN : Number(value);
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
          throw new TypeError(`${flag} expects an integer between 0 and 65535, got '${value ?? ""}'`);
        }
      } else if (kind === "days") {
        const parsed = value === undefined || value === "" ? Number.NaN : Number(value);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw new TypeError(`${flag} expects a whole number of days, 0 or more, got '${value ?? ""}'`);
        }
      } else if (kind === "rules") {
        if (value !== "now" && value !== "then") {
          throw new TypeError(`${flag} expects now or then, got '${value ?? ""}'`);
        }
      } else if (value === undefined || value === "") {
        throw new TypeError(kind === "directory" ? `${flag} expects a directory path` : `${flag} expects a file path`);
      }
      values[flag as F] = value ?? "";
    }

    return values;
  }
}
