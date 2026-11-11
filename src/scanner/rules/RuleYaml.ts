import { parse } from "yaml";

import { RuleLoadError } from "./RuleLoadError.js";

/** Parses a rule or list file strictly: a duplicate key or a YAML error names the file. */
export class RuleYaml {
  parse(file: string, text: string): unknown {
    try {
      return parse(text, { strict: true, uniqueKeys: true });
    } catch (error) {
      throw new RuleLoadError(file, "yaml", error instanceof Error ? error.message : String(error));
    }
  }
}
