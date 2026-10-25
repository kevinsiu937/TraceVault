# ADR 0003 — OpenCode session store format

- **Status:** accepted for ticket 11 (measured)
- **Date:** 26 October 2026
- **Deciders:** Kevin Siu, Hui Siu Hin

## Context

Ticket 11 imports every session already in OpenCode's own store. Before writing the
adapter we inspected the store on this machine so the reader reads the real shape rather
than a guess.

Candidates checked:

| Path | Result |
|---|---|
| `%USERPROFILE%\.local\share\opencode\opencode.db` | **present, authoritative** |
| `%USERPROFILE%\.local\share\opencode\storage\` | plugin scratch (usage reminders, readme cache, TUI state), no sessions |
| `C:\Users\kevin\.local\share\opencode\opencode.db` | present, same schema |
| `%LOCALAPPDATA%\opencode\` | absent |

The store is **SQLite** (not JSON files), with a `-wal` and `-shm` beside it. The
inspected database held 30 sessions, 383 messages, 1,520 parts and 514 tool parts. It was
opened with `readOnly: true`; no write was observed.

## Layout

Only these tables matter for import.

### `session`

One row per agent session. Times are epoch milliseconds.

```sql
CREATE TABLE session (
  id text PRIMARY KEY,          -- ses_...
  parent_id text,               -- null for a root session, ses_... for a subagent
  slug text NOT NULL,           -- e.g. neon-falcon
  directory text NOT NULL,      -- working directory at creation
  title text NOT NULL,          -- human title shown in the agent UI
  version text NOT NULL,        -- OpenCode version, e.g. 1.18.25
  agent text,                   -- e.g. build, general, "Sisyphus - ultraworker"
  time_created integer NOT NULL,-- epoch ms
  time_updated integer NOT NULL -- epoch ms; last write, used as session end
);
```

Example (paths scrubbed):

```json
{
  "id": "ses_e8c252bddffeW4MrHISXlhvYqK",
  "parent_id": null,
  "slug": "neon-falcon",
  "directory": "<project>",
  "title": "Echo test command with DONE reply",
  "version": "1.18.25",
  "agent": "Sisyphus - ultraworker",
  "time_created": 1792945083427,
  "time_updated": 1792945086877
}
```

### `part`

One row per message part. `data` is a JSON document; its `type` discriminates the part.
The parts relevant to import are `type: "tool"` and `type: "patch"`.

```sql
CREATE TABLE part (
  id text PRIMARY KEY,          -- prt_...; stable, used for import correlation ids
  message_id text NOT NULL,
  session_id text NOT NULL,
  time_created integer NOT NULL,
  time_updated integer NOT NULL,
  data text NOT NULL            -- JSON
);
```

Measured part type counts: `tool` 516, `step-start` 327, `step-finish` 313,
`reasoning` 263, `text` 133, `patch` 7.

Tool part envelope:

```json
{
  "type": "tool",
  "tool": "bash",
  "callID": "call_...",
  "state": {
    "status": "completed",        // completed | error (pending/running may appear live)
    "input": { },
    "output": "...",
    "metadata": { },
    "title": "...",
    "time": { "start": 1792932344894, "end": 1792932344929 },
    "error": "..."                // only when status is error
  }
}
```

## One example per tool kind

### `bash` — shell command

```json
{
  "type": "tool",
  "tool": "bash",
  "callID": "call_00_ltlehzwl2zy0n49ssevg8wrg",
  "state": {
    "status": "completed",
    "input": { "command": "dir /b" },
    "output": "agents\r\nskills\r\n",
    "metadata": { "exit": 0, "truncated": false },
    "title": "dir /b",
    "time": { "start": 1792932344894, "end": 1792932344929 }
  }
}
```

`metadata.exit` is the outcome. Non-zero maps to `outcome: "error"`.

### `read` — file read

```json
{
  "type": "tool",
  "tool": "read",
  "callID": "call_00_1cavwop1hcuk5t7urg2vfxjd",
  "state": {
    "status": "completed",
    "input": { "filePath": "<home>/.config/opencode/opencode.jsonc" },
    "metadata": { "truncated": false },
    "time": { "start": 1792932345000, "end": 1792932345020 }
  }
}
```

### `edit` — in-place file change

```json
{
  "type": "tool",
  "tool": "edit",
  "callID": "call_04_zwlm8ntmfgf9a4l2m7e7g7mu",
  "state": {
    "status": "completed",
    "input": {
      "filePath": "<project>/docs/EVENT-SCHEMA.md",
      "oldString": "...",
      "newString": "..."
    },
    "metadata": { "diff": "..." },
    "time": { "start": 1792934746582, "end": 1792934746613 }
  }
}
```

### `write` — whole-file write

```json
{
  "type": "tool",
  "tool": "write",
  "callID": "call_00_gep4kpyvqnxzvqltp8pjh1f3",
  "state": {
    "status": "completed",
    "input": { "filePath": "<project>/src/a.ts", "content": "..." },
    "metadata": { "filepath": "<project>/src/a.ts", "exists": false },
    "time": { "start": 1792932698296, "end": 1792932698476 }
  }
}
```

### `patch` — files touched by one agent step

```json
{
  "type": "patch",
  "hash": "62e6a40b5fb81b01121f0bbd0f74d1f1860ca9ca",
  "files": [
    "<project>/tests/seams/install.seam.test.ts"
  ]
}
```

A patch carries no call id. Import derives one stable id per file from the part id.

### MCP call — `<server>_<tool>` name

```json
{
  "type": "tool",
  "tool": "context7_resolve-library-id",
  "callID": "call_00_ET_KgeIx3i09XQjfIQTMcEc2715",
  "state": {
    "status": "completed",
    "input": { "libraryName": "express", "query": "routing" },
    "time": { "start": 1792938079224, "end": 1792938080565 }
  }
}
```

### `skill` — skill invocation

```json
{
  "type": "tool",
  "tool": "skill",
  "callID": "call_00_fc1mgd9y2q8iynf0tbxnmpq0",
  "state": {
    "status": "completed",
    "input": { "name": "poteto-mode", "user_message": "..." },
    "time": { "start": 1792932752904, "end": 1792932753416 }
  }
}
```

### Other built-ins — `webfetch`, `glob`, etc.

```json
{
  "type": "tool",
  "tool": "webfetch",
  "callID": "call_00_ET_r7wOHzh4DaKlCvwSRZTI9715",
  "state": {
    "status": "completed",
    "input": { "url": "https://example.com" },
    "title": "https://example.com (text/html; charset=utf-8)",
    "time": { "start": 1792938085932, "end": 1792938086167 }
  }
}
```

### Failed tool part

```json
{
  "type": "tool",
  "tool": "glob",
  "callID": "call_01_bg0pykkqjgjbf1gfueb7hsb9",
  "state": {
    "status": "error",
    "input": { "pattern": "**/AGENTS.md" },
    "error": "Tool execution aborted",
    "metadata": { "interrupted": true },
    "time": { "start": 1792932530873, "end": 1792932539456 }
  }
}
```

## Decision

`OpenCodeStoreSource` reads `session` and `part` only, opening the database with
`readOnly: true` and passing no pragmas that write. It never creates, updates, deletes,
checkpoints or vacuums. An absent store is reported as unavailable, not as an error.

Mapping to TraceVault vocabulary:

| Stored part | TraceVault event | Target |
|---|---|---|
| `read` | `document.access` (`read`) | `state.input.filePath` |
| `write`, `edit` | `document.access` (`write`) | `state.input.filePath` |
| `patch` | one `document.access` (`write`) per `files[]` | each path |
| `<server>_<tool>` | `mcp.call` | server + tool |
| `skill` | `skill.call` | skill name |
| `bash`, `webfetch`, other | `hook.script` | command / URL / pattern / path |

Tool classification is delegated to the existing `ToolClassifier`; the importer only
adapts the stored shape. Session boundaries come from `time_created` / `time_updated`,
the title from `session.title`, the agent from `session.agent`, and the timestamp of an
action from `state.time.end` (falling back to `part.time_created`).

## Consequences

- Import is read-only by construction; the fixture test hashes the store before and after.
- Idempotency needs a stable id per stored part. `part.id` is that id; a patch adds its
  file index. A second import skips every existing correlation id.
- The stored output is never imported. Payloads stay shape/size only, matching live capture.
- SQLite WAL is allowed because read-only readers share the `-shm`; the adapter does not
  request exclusive locking.

## Alternatives rejected

- **Read the JSON files under `storage/`:** they hold plugin scratch, not sessions. The
  sessions live only in SQLite on this OpenCode version.
- **Use OpenCode's HTTP API:** not guaranteed to be running, and the store is the complete
  history including sessions that predate installation.
- **Copy the database before reading:** hides accidental writes but doubles disk use and
  could race a live writer. Opening read-only is stricter and testable by byte hash.
