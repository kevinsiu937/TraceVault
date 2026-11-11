import { PermissionPattern } from "../rules/PermissionPattern.js";

type Action = "allow" | "ask" | "deny";
type Block = Readonly<Record<string, unknown>>;

interface PermissionRule {
  readonly permission: string;
  readonly pattern: string;
  readonly action: Action;
  readonly entry: string;
}

export interface PermissionDecision {
  readonly action: Action;
  readonly entry: string;
}

const DEFAULT = "OpenCode default";
const ACTIONS: readonly string[] = ["allow", "ask", "deny"];

// Recorded from the OpenCode 1.18.32 bundle (docs/probes/phase-3-live-probes.md); check again after an upgrade.
// shortcut: the folders OpenCode allows for itself (temp, its data folder) are left out, add them when a rule asks about external_directory.
const DEFAULTS: Block = {
  "*": "allow",
  doom_loop: "ask",
  external_directory: { "*": "ask" },
  question: "deny",
  plan_enter: "deny",
  plan_exit: "deny",
  read: { "*": "allow", "*.env": "ask", "*.env.*": "ask", "*.env.example": "allow" },
};
// The built-in agents that are offered tools, each with its own layer between the defaults and the configuration.
const NATIVE: Readonly<Record<string, Block>> = {
  build: { question: "allow", plan_enter: "allow" },
  plan: { question: "allow", plan_exit: "allow", task: { general: "deny" }, edit: { "*": "deny", ".opencode/plans/*.md": "allow" } },
  general: { todowrite: "deny" },
  explore: { "*": "deny", grep: "allow", glob: "allow", list: "allow", bash: "allow", webfetch: "allow", websearch: "allow", read: "allow" },
};

/**
 * Answers "would this agent make this call without asking?" from a recorded
 * configuration, the way OpenCode resolves it: defaults, the built-in agent's
 * own layer, the top-level block, then the agent's block. The last rule whose
 * permission and pattern both match decides; "ask" applies when none does.
 */
export class EffectivePermissions {
  private constructor(private readonly byAgent: ReadonlyMap<string, readonly PermissionRule[]>) {}

  static of(config: Block): EffectivePermissions {
    const top = EffectivePermissions.rules(config["permission"], "/permission");
    const configured = EffectivePermissions.block(config["agent"]);
    const byAgent = new Map<string, readonly PermissionRule[]>();
    for (const name of new Set([...Object.keys(NATIVE), ...Object.keys(configured)])) {
      const own = EffectivePermissions.block(configured[name]);
      if (own["disable"] === true) {
        continue;
      }
      byAgent.set(name, [
        ...EffectivePermissions.rules(DEFAULTS, null),
        ...EffectivePermissions.rules(NATIVE[name], null),
        ...top,
        ...EffectivePermissions.rules(own["permission"], `/agent/${EffectivePermissions.escape(name)}/permission`),
      ]);
    }
    return new EffectivePermissions(byAgent);
  }

  agents(): string[] {
    return [...this.byAgent.keys()];
  }

  decide(agent: string, permission: string, target: string): PermissionDecision {
    const rules = this.byAgent.get(agent) ?? [];
    for (let index = rules.length - 1; index >= 0; index -= 1) {
      const rule = rules[index];
      if (rule !== undefined && PermissionPattern.of(rule.permission).allows(permission) && PermissionPattern.of(rule.pattern).allows(target)) {
        return { action: rule.action, entry: rule.entry };
      }
    }
    return { action: "ask", entry: DEFAULT };
  }

  /** A string applies to every pattern of that permission; a map lists patterns in order. */
  private static rules(value: unknown, prefix: string | null): PermissionRule[] {
    const rules: PermissionRule[] = [];
    for (const [permission, setting] of Object.entries(EffectivePermissions.block(value))) {
      const entry = prefix === null ? DEFAULT : `${prefix}/${EffectivePermissions.escape(permission)}`;
      const patterns = typeof setting === "string" ? { "*": setting } : EffectivePermissions.block(setting);
      for (const [pattern, action] of Object.entries(patterns)) {
        if (typeof action === "string" && ACTIONS.includes(action)) {
          const pointer = prefix === null || typeof setting === "string" ? entry : `${entry}/${EffectivePermissions.escape(pattern)}`;
          rules.push({ permission, pattern, action: action as Action, entry: pointer });
        }
      }
    }
    return rules;
  }

  private static block(value: unknown): Block {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Block) : {};
  }

  private static escape(token: string): string {
    return token.replaceAll("~", "~0").replaceAll("/", "~1");
  }
}
