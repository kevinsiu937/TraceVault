# Event Schema — draft v0 (NOT YET APPROVED)

> This is the first artifact the project needs: every capture path emits it, every stage consumes it. Drafted 25 Oct 2026 from the submitted proposal's §3.2 (six event types, three capture paths) and §3.5 (timeline ordering, gaps shown).
> Kevin approves or amends this before implementation starts. Nothing downstream should be built against a draft.

## Design rules

1. One envelope, one event type per record. A single agent action that touches two capture paths produces **two records linked by `correlation_id`**, never one merged record — the investigator merges at read time so the raw evidence stays intact.
2. Timestamps are ISO 8601 UTC with millisecond precision. Local time is a display concern.
3. `seq` is the agent's own session sequence number when the capture path provides one, else `null`. Ordering is `(timestamp, seq, capture_path)`.
4. Nothing that could contain a secret value is stored: fields for secrets are named `*_ref` and hold identifiers only.
5. Unknown fields from an agent are preserved under `raw_extra`, so a schema change does not lose evidence.

## Envelope

```jsonc
{
  "id": "evt_01JABCD...",            // ULID, monotonic, sortable
  "schema_version": 1,
  "type": "mcp.call",                // see event types below
  "session_id": "ses_...",           // agent's session identifier
  "agent": {
    "name": "opencode",              // adapter name, never a version-specific id
    "version": "1.x"
  },
  "capture_path": "plugin_hook",     // plugin_hook | session_store | mcp_proxy
  "timestamp": "2026-10-25T11:32:04.812Z",
  "seq": 42,                          // may be null
  "duration_ms": 1234,                // wall-clock time of the action; null when unknown
  "correlation_id": null,             // links records describing the same action
  "prev_hash": "sha256:...",          // store-assigned, null before write
  "data": { },                        // type-specific, see below
  "raw_extra": { }                    // unparsed agent fields, verbatim
}
```

## `duration_ms`

Envelope-level, never inside `data`, so a record keeps the same `data` shape whichever path captured it.

Two sources:

1. **Live plugin hooks** — the plugin times the gap between `tool.execute.before` and `tool.execute.after` (or a failed tool's `message.part.updated`) for the same `sessionID:callID`, using `performance.now()`. The raw hook payload carries no timestamp, so this is measured in the plugin, not read from the payload.
2. **Imported session-store parts** — derived from the part's own `state.time.start` and `state.time.end` when both are numbers and `end >= start`.

It is `null` when the duration is unknown: no matching start record, an invalid measurement, a patch record, or a row written before this field existed. Consumers must treat `null` as "unknown", not as zero.

## Event types (the six from the proposal)

### `skill.call`
The agent invokes a skill or capability.
```jsonc
"data": {
  "skill": "code-review",
  "invoker": "model",                 // model | user | plugin | unknown
  "params_digest": "sha256:...",      // digest, not the payload
  "params_size_bytes": 812
}
```

### `api_key.call`
A credential is used. **Never the value.**
```jsonc
"data": {
  "key_ref": "env:OPENAI_API_KEY",    // identifier only
  "service": "api.openai.com",
  "method": "POST",
  "status": 200
}
```

### `document.access`
File or document touched.
```jsonc
"data": {
  "path": "src/auth/session.ts",      // absolute in store, relative in UI
  "operation": "read",                // read | write | delete | rename
  "bytes": 2048,
  "outside_project": false            // true ⇒ scope-drift rule input
}
```

### `mcp.call`
Traffic to an external MCP server. Captured by the proxy, since plugin hooks do not fire for these.
```jsonc
"data": {
  "server": "filesystem",
  "tool": "read_file",
  "args_digest": "sha256:...",
  "args_size_bytes": 96,
  "outcome": "ok",                    // ok | error | denied | timeout
  "duration_ms": 41,
  "status": 200
}
```

### `hook.script`
A hook or script the agent ran as part of its own dispatch.
```jsonc
"data": {
  "hook": "tool.execute.after",
  "target_tool": "bash",
  "target": "echo tracevault-fixture",
  "exit_code": 0,
  "outcome": "ok"                    // ok | error
}
```

### `admin.grant`
A permission or role is elevated.
```jsonc
"data": {
  "scope": "write:/etc",
  "grantor": "user",                  // user | config | default
  "expires_at": null,                 // null ⇒ unflagged, but the static scanner will complain
  "reviewed": false
}
```

## Meta events (not agent activity, but required by the design)

| Type | Purpose |
|---|---|
| `session.start` / `session.end` | Timeline bounds; `end` missing ⇒ session still open or crash |
| `capture.gap` | A path could not observe a window. Fields: `capture_path`, `from`, `to`, `reason`. **This is what "gaps shown rather than hidden" means in data.** |
| `capture.duplicate` | Two paths saw the same action — recorded so the investigator can prove de-duplication rather than trust it |
| `scan.finding` | A scanner raised a flag. Fields: `rule_id`, `rule_source` (`static`/`workflow`), `severity`, `event_ids[]`, `explanation` |

## Open questions for Kevin

1. **`document.access` path storage** — absolute path (better forensics) or project-relative (safer to share)? Recommend: absolute in the store, relative in every export and in the UI.
2. **Payload capture depth** — digests only (safe, weak forensics) or arguments verbatim with redaction (strong forensics, redaction risk)? Recommend: verbatim with a deny-list redactor, because investigation is the product.
3. **`seq` from the session store** — OpenCode's persisted store may not expose a usable monotonic counter. Confirm during the Logger spike; if absent, fall back to insertion order and mark `seq: null`.
4. **Session boundary** — does a resumed session continue `session_id` or start a new one? Affects the `probing` and `escalation-then-use` rules, which are session-scoped.
