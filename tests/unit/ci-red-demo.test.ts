import { expect, it } from "vitest";

it("fails on purpose to prove the CI gate", () => {
  expect(1).toBe(2);
});
