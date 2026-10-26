import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PendingGapStore } from "../../src/plugin/PendingGapStore.js";

describe("PendingGapStore", () => {
  let directory: string;
  let path: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-gaps-"));
    path = join(directory, "nested", "pending-gaps.json");
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it("records a failed forward and loads it back", () => {
    new PendingGapStore(path).record("ses_a", new Date("2026-10-25T10:00:00.000Z"));

    expect(new PendingGapStore(path).load()).toEqual([
      {
        sessionID: "ses_a",
        from: "2026-10-25T10:00:00.000Z",
        lastFailureAt: "2026-10-25T10:00:00.000Z",
      },
    ]);
  });

  it("extends lastFailureAt without moving from on a later failure", () => {
    const store = new PendingGapStore(path);
    store.record("ses_a", new Date("2026-10-25T10:00:00.000Z"));
    store.record("ses_a", new Date("2026-10-25T10:05:00.000Z"));

    expect(store.load()).toEqual([
      {
        sessionID: "ses_a",
        from: "2026-10-25T10:00:00.000Z",
        lastFailureAt: "2026-10-25T10:05:00.000Z",
      },
    ]);
  });

  it("keeps one entry per failed session", () => {
    const store = new PendingGapStore(path);
    store.record("ses_a", new Date("2026-10-25T10:00:00.000Z"));
    store.record("ses_b", new Date("2026-10-25T10:01:00.000Z"));

    expect(store.load().map((gap) => gap.sessionID)).toEqual(["ses_a", "ses_b"]);
  });

  it("removes only the flushed sessions", () => {
    const store = new PendingGapStore(path);
    store.record("ses_a", new Date("2026-10-25T10:00:00.000Z"));
    store.record("ses_b", new Date("2026-10-25T10:01:00.000Z"));

    store.remove(["ses_a"]);

    expect(store.load().map((gap) => gap.sessionID)).toEqual(["ses_b"]);
  });

  it("clears every entry", () => {
    const store = new PendingGapStore(path);
    store.record("ses_a", new Date("2026-10-25T10:00:00.000Z"));

    store.clear();

    expect(store.load()).toEqual([]);
  });

  it("loads an unreadable file as no gaps", () => {
    new PendingGapStore(path).record("ses_a", new Date("2026-10-25T10:00:00.000Z"));
    writeFileSync(path, "not json", "utf8");

    expect(new PendingGapStore(path).load()).toEqual([]);
  });

  it("loads a missing file as no gaps", () => {
    expect(new PendingGapStore(path).load()).toEqual([]);
  });

  it("recovers a gap from a temporary file left by an interrupted write", () => {
    const store = new PendingGapStore(path);
    store.record("ses_a", new Date("2026-10-25T10:00:00.000Z"));
    rmSync(path);
    writeFileSync(
      `${path}.tmp`,
      JSON.stringify([{ sessionID: "ses_a", from: "2026-10-25T10:00:00.000Z", lastFailureAt: "2026-10-25T10:05:00.000Z" }]),
      "utf8",
    );

    expect(store.load()).toEqual([
      { sessionID: "ses_a", from: "2026-10-25T10:00:00.000Z", lastFailureAt: "2026-10-25T10:05:00.000Z" },
    ]);
  });
});
