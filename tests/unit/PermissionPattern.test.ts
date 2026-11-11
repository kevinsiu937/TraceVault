import { describe, expect, it } from "vitest";

import { PermissionPattern } from "../../src/scanner/rules/PermissionPattern.js";

describe("PermissionPattern", () => {
  it.each([
    ["date *", "date", true],
    ["date *", "date -u", true],
    ["date *", "datediff 2026-01-01", false],
    ["date *", "echo date", false],
    ["date *", "Date -u", false],
    ["git diff *", "git diff --stat", true],
    ["git diff *", "git status", false],
    ["cat *", "cat <<EOF\nsecret\nEOF", true],
    ["ls ?.txt", "ls a.txt", true],
    ["ls ?.txt", "ls .txt", false],
    ["ls a.txt", "ls abtxt", false],
    ["npm run (build)", "npm run (build)", true],
    [".\\scripts\\build.ps1 *", "./scripts/build.ps1 -Release", true],
    ["./scripts/build.ps1 *", ".\\scripts\\build.ps1 -Release", true],
  ])("%j allows %j: %s", (pattern, command, allowed) => {
    expect(PermissionPattern.of(pattern).allows(command)).toBe(allowed);
  });
});
