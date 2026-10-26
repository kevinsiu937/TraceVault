# 21 — Prompt-turn probe: reproduce, freeze, then group

**What to build:** The prototype's strongest structural idea — grouping the timeline by user prompt, each prompt expanding into the actions it caused — cannot be built yet because the live hook payload's user-message shape was never observed. Per AGENTS.md §3, this is a probe ticket: reproduce a live session where the user sends two or more prompts, record what the hook payload actually carries for a user message, freeze it as a fixture, then pin a seam-B test asserting the prompt is distinguishable from tool events.

**Blocked by:** 03 — Session boundaries and open sessions.

**Status:** ready-for-agent

- [x] Live probe: a session with ≥2 user prompts is run; the raw hook payload for the prompt boundary is recorded and frozen as a fixture
- [x] The report says what happened — which identifier/field separates one user prompt from the next (per AGENTS.md §3: "say in the report that this is what happened")
- [x] A seam-B test asserts a prompt event is normalised with its own type and session identity
- [x] The fixture is scrubbed: no credential, no absolute user path, no full argument payload
- [x] The probe narrative is the demo of this ticket, not just green tests

**Technical notes (from prototype):** Finding from applying real data: `003-real-session` has no user-prompt events at all, so the List view can only show one flat "Full run" group. If the payload does carry prompts, ticket 22 consumes it; if it does not, the report must say so and the design picks a fallback (time-bucketed segments) with the human's approval. Do not invent a grouping before the probe answers.

## Result (26 Oct 2026)

The measured shape is in `docs/probes/phase-1-live-probes.md` §21. `chat.message` fires
once per user message; `output.message.id` (`messageID`) plus `output.message.time.created`
separates one turn from the next, and `output.parts` carries the text.

Frozen fixture: `tests/fixtures/chat-message-user-prompt.json` (scrubbed: fixture ids only,
no credential, no absolute path, no arguments). The plugin forwards:

```json
{"hook":"chat.message","sessionID":"ses_fixture_prompt","messageID":"msg_fixture_prompt",
 "createdAt":"2026-10-26T14:31:07.314Z","text":"Reply with exactly PROBE-ONE","truncated":false}
```

`truncated` is forwarded because the stored text is already capped; without it a genuine
200-character prompt could not be told apart from a shortened one. A prompt is stored as
`prompt.user` with `correlation_id = messageID`, so a re-observation collapses as a
`capture.duplicate` and the timeline shows the turn once.

Stored event (seam B, read back from SQLite):

```json
{"type":"prompt.user","session_id":"ses_fixture_prompt","correlation_id":"msg_fixture_prompt",
 "timestamp":"2026-10-26T14:31:07.314Z",
 "data":{"text":"Reply with exactly PROBE-ONE","message_id":"msg_fixture_prompt","truncated":false}}
```

Pinned by `tests/seams/prompt.seam.test.ts` (8 tests). Prompts are excluded from the
session list's activity count and `lastOutcome`.

Two pieces of debt for ticket 22:

1. **Harness-injected messages are recorded as prompts.** The harness sends a second
   role-`user` message per turn containing an `<available-skills>` block. It is
   structurally indistinguishable from a typed prompt, so the plugin does not filter it;
   turn grouping must recognise and ignore these blocks rather than assume one prompt
   per turn.
2. **Prompt text is truncated at 200 characters.** The row keeps `truncated: true` so a
   grouping view can say so; the full text is not retained anywhere.

