# Architecture

Semester 1 implements stages 1–4 plus the report generator. The simulator is Semester 2 and does not appear here.

```
                       ┌──────────────┐
  OpenCode ────────────►  Capture     │  plugin hook receiver
    (plugin hook)      │              │
                       │  session     │  session-store readers
    (session store) ───►  readers     │
                       │              │
    (MCP traffic) ─────►  MCP proxy   │
                       └──────┬───────┘
                              │ normalised events, one schema
                              ▼
                       ┌──────────────┐
                       │   Store      │  SQLite, append-only, hash-chained
                       └──────┬───────┘
                    ┌─────────┴──────────┐
                    ▼                    ▼
            ┌───────────────┐    ┌───────────────┐
            │ Vulnerability │    │   Workflow    │  both read the same event
            │   Scanner     │    │   Scanner     │  stream; rules are YAML
            │  (static cfg) │    │  (sequences)  │
            └───────┬───────┘    └───────┬───────┘
                    └────────┬───────────┘
                             ▼
                    ┌─────────────────┐
                    │  Investigator   │  timeline + query, gaps shown
                    └────────┬────────┘
                             ▼
                    ┌─────────────────┐
                    │ Report Generator│
                    └────────┬────────┘
                             ▼
                     Dashboard (127.0.0.1)
                  Sessions · Report · Simulations(disabled)
```

## Component contracts

### Capture (`src/capture/`)

Emits `Event` records. Three adapters, one schema. **The capture layer may never drop an event silently** — an event it cannot parse becomes a `capture.gap` record, not a log line.

- `plugin-hook` — receives hook payloads from the agent plugin. Highest fidelity: sees built-in file edits, shell, network.
- `session-store` — reads the agent's persisted session history, including sessions that predate installation. Used for backfill and for the events hook payloads do not carry.
- `mcp-proxy` — registers as a local MCP proxy and rewires the agent's MCP server entries through it. Records server identity, tool name, arguments as transmitted, outcome, timestamp.

Each adapter is thin: translate, do not interpret. Interpretation belongs to the scanners.

### Store (`src/store/`)

- SQLite, one table of events plus indexes on session, timestamp and event type.
- **Append-only.** Each row stores `prev_hash`; `hash = sha256(prev_hash || canonical_json(event))`. Deletion or modification of any row breaks the chain.
- Hash chain is a *property of the store*, not the product thesis: the thesis is the unified investigation view. Do not market it as novel.
- Read API: by session, by time range, by type, by flag.

### Vulnerability Scanner (`src/scanner/static/`)

Runs against the agent's configuration, before the agent runs. Rule families:

- excessive permissions relative to the stated task
- unscoped credentials
- missing boundaries between read and egress capability
- ungoverned admin grants
- dangerous combinations (arbitrary file read **and** outbound request on one agent)
- **tool poisoning** — malicious instructions embedded in MCP tool descriptions and metadata

Rule sources: the agent's schema and permission model, OWASP MCP Top 10, OWASP Top 10 for Agentic Applications, documented incidents and CVEs, least-privilege baseline.

### Workflow Scanner (`src/scanner/dynamic/`)

Rule-based over the event stream. Six rule families, each a YAML file in `rules/`:

| Rule | Condition |
|---|---|
| `exfiltration-chain` | sensitive read followed by outbound request |
| `destructive-action` | file deletion after a declared freeze |
| `self-modification` | editing agent config |
| `escalation-then-use` | permission granted then immediately used |
| `probing` | repeated denied permission |
| `scope-drift` | access outside the project directory |

Matcher holds partial matches per session and raises a flag when the final condition matches. No ML: every flag names the rule and the events that satisfied it.

### Investigator (`src/investigator/`)

Merges events from all three capture paths into one timeline ordered by timestamp and session sequence number. Where the merged timeline is not continuous, it renders an explicit gap marker. Query by agent, time range, event type, flag.

### Report Generator (`src/report/`)

Static output from scanner results, sectioned by event type. If an LLM is used at all, it formats prose only — it never produces a judgement that cannot be traced to a rule and the events behind it.

### Dashboard (`src/dashboard/`)

Local HTTP API + WebSocket push. Three tabs: Sessions, Report, Simulations (disabled in Semester 1). Bound to `127.0.0.1`.

## Data flow invariants

1. Nothing leaves the machine. No outbound network calls from the service.
2. A flag always resolves to a rule id plus event ids.
3. An event, once written, is never rewritten.
4. Any capture path failing is visible as data, not as absence.
