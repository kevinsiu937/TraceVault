import { PermissionPattern } from "../rules/PermissionPattern.js";

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

interface Rule {
  readonly permission: string;
  readonly pattern: string;
  readonly action: unknown;
}

const STRICTNESS: Readonly<Record<string, number>> = { allow: 0, ask: 1, deny: 2 };

/**
 * Tightens the top-level `permission` block of an OpenCode configuration so
 * the agent asks before it runs commands, fetches, leaves the project, edits
 * its own configuration or reads secrets. It never loosens: every call the
 * user's top-level rules denied stays denied. Everything outside the
 * top-level block is untouched, so an agent's own permissions are reported by
 * the static rules, not changed.
 */
export class ConfigHardener {
  harden(config: Readonly<Block>): HardenedConfig {
    const before = ConfigHardener.permission(config["permission"]);
    const rules = Object.entries(before).flatMap(([permission, value]) =>
      Object.entries(ConfigHardener.patterns(value)).map(([pattern, action]) => ({ permission, pattern, action })),
    );
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
      after[key] = ConfigHardener.askAll(key, rules);
    }
    after["edit"] = ConfigHardener.append("edit", rules, before["edit"], SELF, []);
    after["read"] = ConfigHardener.append("read", rules, before["read"], SECRETS, [["*.env.example", "allow"]]);
    for (const key of [...ASK_ALL, "edit", "read"]) {
      const was = ConfigHardener.text(before[key]);
      const now = ConfigHardener.text(after[key]);
      if (was !== now) {
        changes.push(`${key}: ${was} → ${now}`);
      }
    }
    return { config: { ...config, permission: after }, changes };
  }

  /**
   * "ask" for everything, keeping the user's patterns only where they are stricter than that.
   * Every pattern that reaches this key, through its own entry or a wildcard permission like "*",
   * is kept after the catch-all, so only a user's catch-all can raise it.
   */
  private static askAll(key: string, rules: readonly Rule[]): unknown {
    const reaching = rules.filter((rule) => PermissionPattern.of(rule.permission).allows(key));
    const own = [...new Set(reaching.map((rule) => rule.pattern))].filter((pattern) => pattern !== "*");
    const resolved = ConfigHardener.tighten(key, rules, [["*", "ask"], ...own.map((pattern) => [pattern, "ask"] as const)]);
    const star = resolved[0]?.[1];
    // An "ask" under an "ask" catch-all says nothing; every other entry stays so a stricter one still decides.
    const kept = resolved.filter(([, action], index) => index === 0 || action !== "ask" || star !== "ask");
    return kept.length === 1 ? star : Object.fromEntries(kept);
  }

  /** The user's rules, then each pattern set to "ask", then any fixed tail, none looser than the user's rules made it. */
  private static append(key: string, rules: readonly Rule[], value: unknown, patterns: readonly string[], tail: readonly (readonly [string, string])[]): unknown {
    if (value === "deny") {
      return "deny";
    }
    const added = new Set([...patterns, ...tail.map(([pattern]) => pattern)]);
    const own = Object.entries(ConfigHardener.patterns(value)).filter(([pattern]) => !added.has(pattern));
    return Object.fromEntries(ConfigHardener.tighten(key, rules, [...own, ...patterns.map((pattern) => [pattern, "ask"] as const), ...tail]));
  }

  /**
   * Raises each planned entry to the strictest action the user's rules gave
   * any call it will now decide. A user rule counts unless the plan keeps it
   * after the entry (it still decides its own calls) or a later user rule for
   * the same pattern or "*" already overrode it. The user's own entry for the
   * same pattern always counts, so a deny they wrote is kept.
   */
  private static tighten(key: string, rules: readonly Rule[], plan: readonly (readonly [string, unknown])[]): [string, unknown][] {
    const relevant = rules.filter((rule) => PermissionPattern.of(rule.permission).allows(key));
    return plan.map(([pattern, intent], index) => {
      const later = new Set(plan.slice(index + 1).map(([next]) => next));
      const entry = PermissionPattern.of(pattern);
      let action = intent;
      relevant.forEach((rule, position) => {
        const follows = later.has(rule.pattern);
        const same = rule.permission === key && rule.pattern === pattern;
        const overridden = !same && relevant.slice(position + 1).some((next) => next.pattern === pattern || next.pattern === "*");
        if (!follows && !overridden && PermissionPattern.of(rule.pattern).overlaps(entry) && ConfigHardener.rank(rule.action) > ConfigHardener.rank(action)) {
          action = rule.action;
        }
      });
      return [pattern, action];
    });
  }

  private static rank(action: unknown): number {
    return typeof action === "string" ? (STRICTNESS[action] ?? -1) : -1;
  }

  /** A string applies to every pattern; a map lists patterns in order. */
  private static patterns(value: unknown): Block {
    return typeof value === "string" ? { "*": value } : ConfigHardener.block(value);
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
