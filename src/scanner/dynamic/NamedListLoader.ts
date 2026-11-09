import { parse } from "yaml";

import { RuleLoadError } from "./RuleLoadError.js";

export interface NamedList {
  readonly name: string;
  readonly items: readonly string[];
}

/** Parses one `lists/*.yaml` file: a `name` matching the file and a list of `items`. */
export class NamedListLoader {
  load(file: string, text: string, expectedName: string): NamedList {
    let document: unknown;
    try {
      document = parse(text, { strict: true, uniqueKeys: true });
    } catch (error) {
      throw new RuleLoadError(file, "yaml", error instanceof Error ? error.message : String(error));
    }
    if (typeof document !== "object" || document === null || Array.isArray(document)) {
      throw new RuleLoadError(file, "list", "must be a mapping");
    }
    const fields = document as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      if (key !== "name" && key !== "items") {
        throw new RuleLoadError(file, key, "unknown key");
      }
    }
    if (fields["name"] !== expectedName) {
      throw new RuleLoadError(file, "name", `must match the file name ('${expectedName}')`);
    }
    const items = fields["items"];
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      !items.every((item) => typeof item === "string" && item.length > 0)
    ) {
      throw new RuleLoadError(file, "items", "must be a non-empty list of strings");
    }
    return { name: expectedName, items: items as string[] };
  }
}
