import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HookPayloadParser } from "../../src/capture/HookPayloadParser.js";
import { PayloadDigest } from "../../src/capture/PayloadDigest.js";
import { PluginHookCapture } from "../../src/capture/PluginHookCapture.js";
import { ToolClassifier } from "../../src/capture/ToolClassifier.js";
import { PendingGapStore } from "../../src/plugin/PendingGapStore.js";
import { TraceVaultPlugin } from "../../src/plugin/TraceVaultPlugin.js";
import { EventFactory } from "../../src/schema/EventFactory.js";
import { InvestigationService } from "../../src/service/InvestigationService.js";
import { TimelineBuilder } from "../../src/service/TimelineBuilder.js";
import { SqliteEventStore } from "../../src/store/SqliteEventStore.js";

// Frozen from the live chat.message probe (docs/probes/phase-1-live-probes.md §21):
// the plugin forwards the user message it saw, scrubbed of live ids.
const PROMPT_FIXTURE = new URL("../fixtures/chat-message-user-prompt.json", import.meta.url);
const RECEIVED_AT = new Date("2026-10-26T14:31:08.000Z");
const PROMPT_CREATED = Date.parse("2026-10-26T14:31:07.314Z");

function readFixture(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

function chatOutput(
  parts: { type: string; text?: string }[],
  role = "user",
  created = PROMPT_CREATED,
): {
  message: { id: string; role: string; sessionID: string; time: { created: number } };
  parts: { type: string; text?: string }[];
} {
  return {
    message: { id: "msg_fixture_prompt", role, sessionID: "ses_fixture_prompt", time: { created } },
    parts,
  };
}

function forwarded(sent: unknown[], hook: string): Record<string, unknown> {
  const match = sent.find(
    (payload) =>
      typeof payload === "object" &&
      payload !== null &&
      (payload as { hook?: unknown }).hook === hook,
  );
  expect(match).toBeDefined();
  return match as Record<string, unknown>;
}

describe("seam B: a user prompt becomes the first timeline entry", () => {
  let directory: string;
  let store: SqliteEventStore;
  let service: InvestigationService;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "tracevault-prompt-"));
    store = new SqliteEventStore(join(directory, "events.db"));
    const factory = new EventFactory();
    const capture = new PluginHookCapture(
      new HookPayloadParser(),
      new ToolClassifier(new PayloadDigest()),
      factory,
    );
    service = new InvestigationService(capture, store, factory, new TimelineBuilder());
  });

  afterEach(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });

  function plugin(sent: unknown[]): TraceVaultPlugin {
    return new TraceVaultPlugin(
      {
        forward: async (payload: unknown): Promise<void> => {
          sent.push(payload);
        },
      },
      new PendingGapStore(join(directory, "pending-gaps.json")),
      () => 0,
    );
  }

  it("stores the forwarded prompt with its own type and the message as correlation id", () => {
    expect(service.recordHookPayload(readFixture(PROMPT_FIXTURE), RECEIVED_AT)).toBe("stored");

    const events = store.listBySession("ses_fixture_prompt");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "prompt.user",
      session_id: "ses_fixture_prompt",
      correlation_id: "msg_fixture_prompt",
      data: {
        text: "Reply with exactly PROBE-ONE",
        message_id: "msg_fixture_prompt",
        truncated: false,
      },
    });
  });

  it("shows the prompt text as the timeline target with the prompt outcome", () => {
    service.recordHookPayload(readFixture(PROMPT_FIXTURE), RECEIVED_AT);

    expect(service.getTimeline("ses_fixture_prompt")).toEqual([
      expect.objectContaining({
        type: "prompt.user",
        target: "Reply with exactly PROBE-ONE",
        outcome: "prompt",
      }),
    ]);
  });

  it("joins the text parts of a user message with one space and forwards the prompt", async () => {
    const sent: unknown[] = [];
    await plugin(sent).hooks()["chat.message"](
      { sessionID: "ses_fixture_prompt" },
      chatOutput([
        { type: "text", text: "  Reply with" },
        { type: "tool" },
        { type: "text", text: "exactly PROBE-ONE  " },
      ]),
    );

    expect(forwarded(sent, "chat.message")).toEqual({
      hook: "chat.message",
      sessionID: "ses_fixture_prompt",
      messageID: "msg_fixture_prompt",
      createdAt: "2026-10-26T14:31:07.314Z",
      text: "Reply with exactly PROBE-ONE",
      truncated: false,
    });
  });

  it("truncates a long prompt to 200 characters and marks it truncated", async () => {
    const sent: unknown[] = [];
    const long = "a".repeat(240);
    await plugin(sent).hooks()["chat.message"]({ sessionID: "ses_fixture_prompt" }, chatOutput([{ type: "text", text: long }]));

    const payload = forwarded(sent, "chat.message");
    expect(payload["text"]).toHaveLength(200);
    expect(payload).toMatchObject({ truncated: true });

    service.recordHookPayload(payload, RECEIVED_AT);
    const [event] = store.listBySession("ses_fixture_prompt");
    expect(event?.data).toEqual({ text: "a".repeat(200), message_id: "msg_fixture_prompt", truncated: true });
  });

  it("does not forward a message that is not a user prompt", async () => {
    const sent: unknown[] = [];
    const hooks = plugin(sent).hooks();

    await hooks["chat.message"]({ sessionID: "ses_fixture_prompt" }, chatOutput([{ type: "text", text: "hi" }], "assistant"));
    await hooks["chat.message"]({ sessionID: "ses_fixture_prompt" }, chatOutput([{ type: "text", text: "   " }]));
    await hooks["chat.message"]({ sessionID: "ses_fixture_prompt" }, chatOutput([{ type: "tool" }]));

    expect(sent).toEqual([]);
  });

  it("collapses a repeated prompt to one timeline entry and stores the duplicate", () => {
    service.recordHookPayload(readFixture(PROMPT_FIXTURE), RECEIVED_AT);
    service.recordHookPayload(readFixture(PROMPT_FIXTURE), new Date("2026-10-26T14:31:09.000Z"));

    const stored = store.listBySession("ses_fixture_prompt");
    expect(stored.filter((event) => event.type === "prompt.user")).toHaveLength(2);
    expect(stored.filter((event) => event.type === "capture.duplicate")).toHaveLength(1);
    expect(service.getTimeline("ses_fixture_prompt")).toHaveLength(1);
  });

  it("keeps prompts out of the session activity count and last outcome", () => {
    service.recordHookPayload(readFixture(PROMPT_FIXTURE), RECEIVED_AT);
    service.recordHookPayload(
      {
        hook: "tool.execute.after",
        input: { tool: "read", sessionID: "ses_fixture_prompt", callID: "call_after_prompt", args: { filePath: "src/a.ts" } },
        output: { title: "read", metadata: { truncated: false } },
      },
      new Date("2026-10-26T14:31:08.500Z"),
    );
    // A later prompt arrives after the tool call: it must not become lastOutcome.
    service.recordHookPayload(
      {
        hook: "chat.message",
        sessionID: "ses_fixture_prompt",
        messageID: "msg_fixture_prompt_two",
        createdAt: "2026-10-26T14:31:09.000Z",
        text: "and another one",
      },
      new Date("2026-10-26T14:31:09.000Z"),
    );

    const session = service.listSessions().find((entry) => entry.sessionId === "ses_fixture_prompt");
    expect(session).toMatchObject({ eventCount: 1, lastOutcome: "ok" });
  });

  it("rejects a prompt with blank text or no message id", () => {
    const base = readFixture(PROMPT_FIXTURE) as Record<string, unknown>;

    expect(service.recordHookPayload({ ...base, text: "   " }, RECEIVED_AT)).toBe("rejected");
    expect(service.recordHookPayload({ ...base, messageID: "" }, RECEIVED_AT)).toBe("rejected");
    expect(store.listSessions()).toEqual([]);
  });
});
