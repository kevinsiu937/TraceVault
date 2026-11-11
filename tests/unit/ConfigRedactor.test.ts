import { describe, expect, it } from "vitest";

import { ConfigRedactor } from "../../src/plugin/ConfigRedactor.js";

const R = "[redacted]";

describe("ConfigRedactor", () => {
  it.each([
    ["an API key", { provider: { x: { options: { apiKey: "s1" } } } }, { provider: { x: { options: { apiKey: R } } } }],
    ["every header value, keeping the names", { headers: { Authorization: "Bearer s", "X-Trace": "t" } }, { headers: { Authorization: R, "X-Trace": R } }],
    ["every environment value", { environment: { GITHUB_TOKEN: "s", MODE: "fast" } }, { environment: { GITHUB_TOKEN: R, MODE: R } }],
    ["every env value", { env: { HOME_DIR: "/x" } }, { env: { HOME_DIR: R } }],
    ["a key naming a token, ignoring case", { GitHubToken: "s" }, { GitHubToken: R }],
    ["a key naming a secret", { clientSecret: "s" }, { clientSecret: R }],
    ["a key naming a password", { PASSWORD: "s" }, { PASSWORD: R }],
    ["a key naming a credential", { credentials: "s" }, { credentials: R }],
    ["every string inside an auth block", { oauth: { clientId: "a", scope: "b" } }, { oauth: { clientId: R, scope: R } }],
    ["every string in a list under a secret key", { apiKeys: ["a", "b"] }, { apiKeys: [R, R] }],
    ["nothing that is not a string", { maxTokens: 4096, apiKey: null, auth: false }, { maxTokens: 4096, apiKey: null, auth: false }],
    ["an empty secret, which holds no value", { apiKey: "" }, { apiKey: "" }],
    [
      "nothing outside a secret key",
      { model: "deepseek/deepseek-flash", permission: { bash: { "*": "ask", "ls *": "allow" } }, command: ["npx", "server"] },
      { model: "deepseek/deepseek-flash", permission: { bash: { "*": "ask", "ls *": "allow" } }, command: ["npx", "server"] },
    ],
  ])("replaces %s", (_, config, redacted) => {
    expect(new ConfigRedactor().redact(config)).toEqual(redacted);
  });

  it.each([
    ["a list", []],
    ["a string", "config"],
    ["nothing", undefined],
  ])("refuses %s, which is not a configuration", (_, config) => {
    expect(() => new ConfigRedactor().redact(config)).toThrow(TypeError);
  });

  it("refuses a configuration that refers to itself", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    expect(() => new ConfigRedactor().redact(cyclic)).toThrow();
  });

  it("does not change the configuration it was given", () => {
    const config = { provider: { x: { options: { apiKey: "s1" } } } };

    new ConfigRedactor().redact(config);

    expect(config.provider.x.options.apiKey).toBe("s1");
  });
});
