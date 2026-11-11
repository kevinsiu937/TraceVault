import { describe, expect, it } from "vitest";

import { EffectivePermissions } from "../../src/scanner/static/EffectivePermissions.js";

const DEFAULT = "OpenCode default";

describe("EffectivePermissions, resolved as OpenCode 1.18.32 does", () => {
  it.each([
    ["no permission block lets build run anything", {}, "build", "bash", "rm -rf /", "allow", DEFAULT],
    ["plan may run the shell by default", {}, "plan", "bash", "rm -rf /", "allow", DEFAULT],
    ["plan may not edit by default", {}, "plan", "edit", "src/app.ts", "deny", DEFAULT],
    ["explore may run the shell by default", {}, "explore", "bash", "rm -rf /", "allow", DEFAULT],
    ["explore may not edit by default", {}, "explore", "edit", "src/app.ts", "deny", DEFAULT],
    ["a value OpenCode would not accept is ignored", { permission: { bash: { "*": "sometimes" } } }, "build", "bash", "rm -rf /", "allow", DEFAULT],
    ["an agent with no rules is asked, as OpenCode does", {}, "nobody", "bash", "rm -rf /", "ask", DEFAULT],
    [".env reads ask by default", {}, "build", "read", ".env", "ask", DEFAULT],
    [".env.example reads are allowed by default", {}, "build", "read", ".env.example", "allow", DEFAULT],
    ["a string applies to every pattern", { permission: { bash: "ask" } }, "build", "bash", "rm -rf /", "ask", "/permission/bash"],
    ["the last matching pattern decides", { permission: { bash: { "*": "ask", "ls *": "allow" } } }, "build", "bash", "ls -la", "allow", "/permission/bash/ls *"],
    ["an unlisted command falls to the catch-all", { permission: { bash: { "*": "ask", "ls *": "allow" } } }, "build", "bash", "rm x", "ask", "/permission/bash/*"],
    [
      "an agent block overrides the top level",
      { permission: { bash: "ask" }, agent: { build: { permission: { bash: "allow" } } } },
      "build", "bash", "rm -rf /", "allow", "/agent/build/permission/bash",
    ],
    [
      "another agent keeps the top level",
      { permission: { bash: "ask" }, agent: { build: { permission: { bash: "allow" } } } },
      "plan", "bash", "rm -rf /", "ask", "/permission/bash",
    ],
    ["the top level overrides plan's own edit rule", { permission: { edit: "allow" } }, "plan", "edit", "src/app.ts", "allow", "/permission/edit"],
    ["a catch-all permission applies to every tool", { permission: { "*": "deny" } }, "build", "bash", "rm -rf /", "deny", "/permission/*"],
    ["a configured agent starts from the defaults", { agent: { reviewer: { permission: { edit: "deny" } } } }, "reviewer", "bash", "rm -rf /", "allow", DEFAULT],
    ["a slash in a pattern is escaped in the pointer", { permission: { edit: { "src/*": "deny" } } }, "build", "edit", "src/app.ts", "deny", "/permission/edit/src~1*"],
  ])("%s", (_, config, agent, permission, target, action, entry) => {
    expect(EffectivePermissions.of(config).decide(agent, permission, target)).toEqual({ action, entry });
  });

  it("lists the built-in agents that use tools, then the configured ones, without disabled agents", () => {
    const agents = EffectivePermissions.of({ agent: { reviewer: { mode: "subagent" }, explore: { disable: true } } }).agents();

    expect(agents).toEqual(["build", "plan", "general", "reviewer"]);
  });
});
