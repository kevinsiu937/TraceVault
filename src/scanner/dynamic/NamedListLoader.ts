import { RuleLoadError } from "../rules/RuleLoadError.js";
import { RuleYaml } from "../rules/RuleYaml.js";

export interface NamedList {
  readonly name: string;
  readonly items: readonly string[];
}

/** Parses one `lists/*.yaml` file: a `name` matching the file and a list of `items`. */
export class NamedListLoader {
  constructor(private readonly yaml: RuleYaml = new RuleYaml()) {}

  load(file: string, text: string, expectedName: string): NamedList {
    const document = this.yaml.parse(file, text);
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
