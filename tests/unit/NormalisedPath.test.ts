import { describe, expect, it } from "vitest";

import { NormalisedPath } from "../../src/scanner/dynamic/NormalisedPath.js";

describe("NormalisedPath", () => {
  it.each([
    ["C:\\Work\\Demo\\opencode.json", "c:/work/demo/opencode.json"],
    ["/home//dev///demo", "/home/dev/demo"],
    ["/proj/./src/../README.md", "/proj/readme.md"],
    ["/proj/../../etc/passwd", "/etc/passwd"],
    ["C:\\Work\\..\\..\\Windows", "c:/windows"],
    ["src/../../secrets/token", "../secrets/token"],
    ["../../x", "../../x"],
    ["/proj/", "/proj/"],
  ])("reads %j as %j", (raw, expected) => {
    expect(NormalisedPath.of(raw).value).toBe(expected);
  });
});
