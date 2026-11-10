import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import type { ConditionRegistry } from "./ConditionRegistry.js";
import { NamedListLoader } from "./NamedListLoader.js";
import { NamedLists } from "./NamedLists.js";
import { RuleLoadError } from "./RuleLoadError.js";
import { RuleLoader } from "./RuleLoader.js";
import { RuleSet } from "./RuleSet.js";
import { RuleStepLoader } from "./RuleStepLoader.js";

/**
 * Loads a rules directory: shared lists from `lists/*.yaml` first, then every
 * top-level `*.yaml` rule, each in file-name order. The digest covers every
 * file read, so editing a list changes it as surely as editing a rule.
 */
export class RuleSetLoader {
  constructor(
    private readonly conditions: ConditionRegistry,
    private readonly listLoader: NamedListLoader = new NamedListLoader(),
  ) {}

  load(directory: string): RuleSet {
    const hash = createHash("sha256");
    const read = (relative: string): string => {
      const text = readFileSync(join(directory, relative), "utf8");
      hash.update(`${relative}\n${text}\n`);
      return text;
    };

    const listDirectory = join(directory, "lists");
    const lists = new Map<string, readonly string[]>();
    for (const file of existsSync(listDirectory) ? this.yamlFiles(listDirectory, "lists/") : []) {
      const relative = `lists/${file}`;
      const list = this.listLoader.load(relative, read(relative), basename(file, ".yaml"));
      lists.set(list.name, list.items);
    }

    const rules = new RuleLoader(new RuleStepLoader(this.conditions, new NamedLists(lists)));
    const loaded = this.yamlFiles(directory, "").map((file) => rules.load(file, read(file), basename(file, ".yaml")));
    return new RuleSet(loaded, `sha256:${hash.digest("hex")}`);
  }

  /** A `.yml` file would otherwise be skipped without a word, so it stops loading instead. */
  private yamlFiles(directory: string, prefix: string): string[] {
    const files = readdirSync(directory);
    const misnamed = files.find((file) => file.endsWith(".yml"));
    if (misnamed !== undefined) {
      throw new RuleLoadError(`${prefix}${misnamed}`, "file name", `rename it to ${prefix}${basename(misnamed, ".yml")}.yaml`);
    }
    return files.filter((file) => file.endsWith(".yaml")).sort();
  }
}
