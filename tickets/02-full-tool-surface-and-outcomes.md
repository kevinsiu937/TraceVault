# 02 — Every tool type, with outcomes

**What to build:** The record stops being about shell commands and becomes about the agent's whole tool surface: file reads and edits, deletes, web fetches, searches, MCP tool calls and skill calls. Each type lands in the timeline with enough target detail to be recognised at a glance — the command, the path, the URL, the server and tool name.

Outcomes are distinguished: success, error returned by the tool, denied by permission configuration. A denied call and a failing call mean different things to the reader, so they must not look the same.

Payload depth stays forensics-safe: argument shape and a digest, not unrestricted argument text. Credential events carry a key reference, never a secret value.

**Blocked by:** 01 — Walking skeleton.

**Status:** ready-for-agent

- [ ] Running a session that shells out, edits a file, reads a file and fetches a URL produces one event per action, each with the correct type and target
- [ ] A call to an external MCP tool server is captured with the server name and tool name
- [ ] An intentionally denied tool call is recorded as denied, not as an error and not as absent
- [ ] A failing tool call is recorded as error with no success fields populated
- [ ] No test or fixture contains a real credential, absolute user path or full argument payload
- [ ] Seam-B tests cover each event type, including the denied case
