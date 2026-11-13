type Block = Record<string, unknown>;

export interface HardenedConfig {
  readonly config: Readonly<Block>;
  /** One line per permission key that changed: "bash: allow → ask". */
  readonly changes: readonly string[];
}

// Permissions that run code or reach outside the project: everything asks, except what the user already denied.
const ASK_ALL = ["bash", "webfetch", "external_directory", "doom_loop"] as const;
// Files that steer the agent itself. Appended only, so a native agent's own edit rules (plan denies edits) are kept.
const SELF = ["*opencode.json", "*opencode.jsonc", "*.opencode/*", "*AGENTS.md"];
// The same files as rules/lists/sensitive-paths.yaml, written as OpenCode permission patterns, where `*` spans folders.
const SECRETS = [
  "*.env",
  "*.env.*",
  "*.pem",
  "*.key",
  "*id_rsa*",
  "*id_ed25519*",
  "*id_ecdsa*",
  "*.ssh/*",
  "*.aws/credentials",
  "*.config/gcloud/*",
  "*.npmrc",
  "*.netrc",
  "*secrets/*",
  "*credentials.json",
];

/**
 * Tightens the top-level `permission` block of an OpenCode configuration so
 * the agent asks before it runs commands, fetches, leaves the project, edits
 * its own configuration or reads secrets. It never loosens: a value the user
 * set to "deny" stays. Everything outside the top-level block is untouched,
 * so an agent's own permissions are reported by the static rules, not changed.
 */
export class ConfigHardener {
  harden(config: Readonly<Block>): HardenedConfig {
    const before = ConfigHardener.permission(config["permission"]);
    const changes: string[] = [];
    const after: Block = {};
    const managed = new Set<string>([...ASK_ALL, "edit", "read"]);
    for (const [key, value] of Object.entries(before)) {
      if (!managed.has(key)) {
        after[key] = value;
      }
    }
    // The managed keys go last: OpenCode lets the last matching rule decide, so they must follow any "*" the user set.
    for (const key of ASK_ALL) {
      after[key] = ConfigHardener.askAll(before[key]);
    }
    after["edit"] = ConfigHardener.append(before["edit"], SELF, []);
    after["read"] = ConfigHardener.append(before["read"], SECRETS, [["*.env.example", "allow"]]);
    for (const key of [...ASK_ALL, "edit", "read"]) {
      const was = ConfigHardener.text(before[key]);
      const now = ConfigHardener.text(after[key]);
      if (was !== now) {
        changes.push(`${key}: ${was} → ${now}`);
      }
    }
    return { config: { ...config, permission: after }, changes };
  }

  /** "ask" for everything, keeping only the user's own "deny" entries after it. */
  private static askAll(value: unknown): unknown {
    if (value === "deny") {
      return "deny";
    }
    const denied = Object.entries(ConfigHardener.block(value)).filter(([pattern, action]) => pattern !== "*" && action === "deny");
    return denied.length === 0 ? "ask" : { "*": "ask", ...Object.fromEntries(denied) };
  }

  /** The user's rules, then each pattern set to "ask" unless the user denied it, then any fixed tail. */
  private static append(value: unknown, patterns: readonly string[], tail: readonly (readonly [string, string])[]): unknown {
    if (value === "deny") {
      return "deny";
    }
    const own = typeof value === "string" ? { "*": value } : ConfigHardener.block(value);
    const result: Block = {};
    const added = new Set([...patterns, ...tail.map(([pattern]) => pattern)]);
    for (const [pattern, action] of Object.entries(own)) {
      if (!added.has(pattern)) {
        result[pattern] = action;
      }
    }
    for (const pattern of patterns) {
      result[pattern] = own[pattern] === "deny" ? "deny" : "ask";
    }
    for (const [pattern, action] of tail) {
      result[pattern] = own[pattern] === "deny" ? "deny" : action;
    }
    return result;
  }

  private static permission(value: unknown): Block {
    return typeof value === "string" ? { "*": value } : { ...ConfigHardener.block(value) };
  }

  private static block(value: unknown): Block {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Block) : {};
  }

  private static text(value: unknown): string {
    return value === undefined ? "not set" : typeof value === "string" ? value : JSON.stringify(value);
  }
}
