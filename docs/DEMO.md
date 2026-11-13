# TraceVault demo

Four parts, one per phase: capture and the timeline (Phase 1), workflow findings (Phase 2), configuration findings (Phase 3), the session report (Phase 4). Node 24+, from a clean clone. Nothing leaves the machine except the prompts sent to the model provider in parts 2 and 3.

# Phase 1 — capture, store, list, timeline

## 1. Build and start

```bash
npm install
npm run build
node dist/cli/index.js init --dir .
node dist/cli/index.js run --port 4319 --db data/demo.db
```

Open http://127.0.0.1:4319/ . The list shows one row per session with agent, start, end/open and activity count.

## 2. Run a real agent session

In a second terminal, in the same directory:

```bash
opencode run --auto "Use these tools in order, one call each: 1) bash: echo hello > demo.txt  2) edit demo.txt replacing hello with world  3) fetch https://example.com. Then reply DONE."
```

Refresh the list: the session appears with the number of actions. Click it: the timeline shows, in order:

```
session.start
hook.script      echo hello > demo.txt        ok
document.access  demo.txt (read)              ok
document.access  demo.txt (write)             ok
hook.script      https://example.com          ok
session.end
```

A session still running has no `session.end` and is shown as `open`. A second event after an end reopens the session.

## 2b. Visual timeline and filters

The session page is a vertical timeline: one marker per event coloured by kind, time, kind, target and outcome on every row. Click a row to expand the stored event detail in place; the legend shows the kinds in this session with counts.

Filters are URL state, so every view is bookmarkable:

```text
/sessions/<id>?kind=document.access&operation=write   files modified in this session
/sessions/<id>?outcome=error                           failures in this session
/sessions/<id>?q=vault                                 free text over targets
/activity?kind=document.access&operation=write         documents modified, all sessions
/activity?kind=skill.call                              skills used, all sessions
/activity?outcome=error                                everything that failed
```

The chips at the top of the page are the same filters in one click. `/activity` groups matching rows by session, newest session first.

## 3. Errors, duplicates, gaps

- A tool that fails is recorded from the `message.part.updated` error state as `outcome=error`; the page gives it `class="pill error"`.
- A repeated observation with the same call id is stored twice plus a `capture.duplicate` row; the timeline shows the action once.
- If the service is unreachable, the plugin remembers the interval and posts a `capture.gap` on recovery; the timeline shows a `gap` row with the reason.

## 4. Reversible install

```bash
node dist/cli/index.js uninstall --dir .
node dist/cli/index.js init --dir .
```

Uninstall restores a pre-existing `.opencode/plugin/tracevault.js` byte-for-byte (proven in `tests/seams/install.seam.test.ts` by a base64 snapshot of the whole temporary project).

## 5. Gate

```bash
npm run typecheck
npm run build
npm test
```

34 test files, 559 tests (13 Nov 2026).

## Phase 1 exit checklist (recorded 25 Oct 2026)

| Criterion | Status | Evidence |
|---|---|---|
| Real session with shell, edit and fetch appears in order | PASS | `data/demo2.db` session `ses_e8c664512ffeMGlUg4majZGzMD` — 6 ordered events |
| Session list on loopback with start, end/open, count, agent | PASS | `GET /` row: end `2026-10-25T15:07:35.340Z`, count 4 |
| Errors and denials distinguishable | PASS | live permission rejection reproduced (`curl` matched an ask rule), frozen fixture + seam-B test, negative control; see docs/probes/ |
| Ordering deterministic at equal timestamps | PASS | `capture.seam.test.ts` "orders two events with identical timestamps" |
| Duplicate observation recorded and collapsed once | PASS | store has 2 actions + 1 duplicate; timeline shows 1 |
| Append-only hash chain, tamper detected | PASS | `integrity.seam.test.ts` UPDATE and DELETE both fail with session + position |
| Gaps visible as data | PASS | `capture.gap` stored; timeline renders `outcome-gap` |
| Live timeline without reload | PASS (transport) | SSE seam test receives a new event; dedupe/positioning script in page |
| Install/uninstall byte-identical | PASS | `install.seam.test.ts`, 5 tests |
| Two concurrent sessions stay separate | PASS | two interleaved HTTP writers: both listed, each page isolated, order kept. Not proven with two real agent processes under the nested runner |
| 1000-event page renders without stall | PASS | `timeline.seam.test.ts` renders 1000 rows; response under 2s on the local run |
| No scroll jump on live insert | PASS | Chrome/CDP, 1010 rows: insert above viewport moved scrollY by exactly the row height (65px), anchor moved 0.4px, 1 navigation |

## Phase 1 known limitations

- Denials are inferred from the tool error text (`denied|permission|rejected|blocked`); the live denial path was not reproducible here.
- `data.target` stores command/URL/path text; redaction is not implemented (documented debt from ticket 02's predecessor).
- `EVENT-SCHEMA.md` is still marked unapproved; the code emits `schema_version: 1`.
- MCP capture was measured from real hook payloads and pinned by a seam test; no MCP call was routed through the running service during this demo.
- A pre-existing database with the old schema is not migrated; delete `data/*.db` before this version.

# Phase 2 — workflow findings

**What it shows:** the timeline flags a sequence of calls that looks wrong, names the rule, and links the exact events behind the flag.

You need a model with quota. The recorded run used DeepSeek, `deepseek/deepseek-flash`. You also need `sqlite3` on the PATH.

```bash
npm run build
TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/phase-2-exit-run.sh /tmp/tv-phase2
```

The script makes a throwaway workspace with narrow permissions and starts TraceVault on port 4329. It runs one session meant to trip rules and one clean session, then prints the findings on each page:

```text
findings on the trigger page:
   1 <li class="finding" data-rule="exfiltration-chain"
   1 <li class="finding" data-rule="probing"
   1 <li class="finding" data-rule="self-modification"
   1 <li class="finding" data-rule="sensitive-read"
findings on the clean page: 0
```

The model decides what it does, so a rerun can differ. Three or more rules on the trigger page and none on the clean page is the pass.

**Last run (12 Nov 2026):**
- OpenCode 1.18.32 and `deepseek/deepseek-flash`.
- The trigger page showed the four rules above. The clean page showed none.
- The first attempt that day failed. The agent ran `ls -la`, which only `ls` allowed, and the refused call ended its turn before any egress. The script now also allows `ls *`.

To browse the result, start the service on the run's database and open the trigger session:

```bash
TRACEVAULT_OPENCODE_DB=/tmp/tv-phase2/none.db node dist/cli/index.js run --port 4329 --db /tmp/tv-phase2/events.db
```

The Findings panel at the top lists each flag with its rule, its explanation and a link to every event behind it. A link opens that event in the detail pane.

**The script re-records the frozen fixtures.** It overwrites `tests/fixtures/rules/phase-2-exit/`. Run `git restore tests/fixtures` afterwards unless you mean to replace the recorded run.

## Opt-in blocking (experimental)

TraceVault records and flags; it does not prevent. This option is the one exception, kept as an experiment (decided 12 Nov 2026). It skips a dangerous call instead of stopping the agent: the call does not run, the agent is told to carry on without it, and the skipped call is recorded for the user.

`init --block` installs a guard that refuses a call before it runs when a blockable rule matches. The blockable rules are `self-modification` and `sensitive-read`. A plain `init` never blocks. A secret file read through the shell, such as `cat .env`, is flagged by `shell-sensitive-read` but never blocked.

```bash
mkdir /tmp/tv-block && cd /tmp/tv-block
echo '{ "$schema": "https://opencode.ai/config.json" }' > opencode.json
node <repo>/dist/cli/index.js init --dir . --block
node <repo>/dist/cli/index.js run --port 4319 --db /tmp/tv-block/events.db
```

In a second terminal, in `/tmp/tv-block`:

```bash
opencode run -m deepseek/deepseek-flash "Use the edit tool to add \"share\": \"disabled\" to opencode.json."
```

**Expected:**
- The agent is told "TraceVault skipped this call because it matches the rule 'self-modification' …", asked not to retry or work around it, and asked to continue with the rest of the task.
- `opencode.json` is unchanged.
- The timeline shows the edit as `denied`, with the rule id.

**Last run (12 Nov 2026):**
- OpenCode 1.18.32 and `deepseek/deepseek-flash`.
- The agent's edit of `opencode.json` failed with the message above, and the file stayed as written.
- The store holds the edit as `document.access`, outcome `denied`, `blocked_by: self-modification`, and the session page shows one `self-modification` flag.
- Reads, `ls` and a glob in the same session went through.

**Limit:** only the file tools are guarded. A shell command that writes `opencode.json` passes.

## Phase 2 known limitations

These are listed in `docs/spec/phase-2.md` under Known Blind Spots:
- Shell egress is matched by pattern and is easy to evade.
- Prompts are stored cut at 200 characters, so a freeze phrase past that point is missed.
- Rules rescan the whole session on every page load.

# Phase 3 — configuration findings

**What it shows:** risky settings and poisoned MCP tool text are flagged before the agent runs a single tool. Each finding names its source (OWASP, CVE or the least-privilege baseline) and the setting or tool behind it.

```bash
npm run build
TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/phase-3-exit-run.sh /tmp/tv-phase3
```

**What the script does:**
- Builds two workspaces with `tracevault init`: a deliberately misconfigured one, and a clean one.
- In the misconfigured workspace, a subagent nobody invokes holds the risky permissions. A fake local MCP server holds a planted fake token, and one of its tools has a poisoned description.
- Asks each agent for one word. No tool runs.

**Expected:**

```text
misconfigured session ses_…, static findings by rule:
   N <li class="config-finding" data-rule="config-self-edit"
   N <li class="config-finding" data-rule="default-ask-removed"
   N <li class="config-finding" data-rule="git-push-unasked"
   N <li class="config-finding" data-rule="mcp-holds-credentials"
   N <li class="config-finding" data-rule="read-and-egress"
   N <li class="config-finding" data-rule="shell-unrestricted"
   N <li class="config-finding" data-rule="tool-hidden-instructions"
   N <li class="config-finding" data-rule="tool-invisible-text"
clean session ses_…, static findings by rule:
      none
```

`N` is how many agents, servers or tools a rule flags.

**Last run (12 Nov 2026):**
- OpenCode 1.18.32 and `deepseek/deepseek-flash`.
- All seven rules that existed then flagged once each. The clean session showed none.
- `git-push-unasked` was added after this run (ticket 44). The gate reruns the scanner over the recorded run and it flags the `risky` subagent there.

The pass is every rule id on the misconfigured session and none on the clean one.

To browse the result, start the service on the run's database:

```bash
TRACEVAULT_OPENCODE_DB=/tmp/tv-phase3/none.db node dist/cli/index.js run --port 4339 --db /tmp/tv-phase3/events.db
```

Open the misconfigured session and follow "Configuration · N findings" in the header. Check three things:
- The stored configuration shows `[redacted]` in place of the planted token.
- Each finding names the agent, server or tool, and the configuration entry behind it.
- The hidden characters in the poisoned tool are shown as `[hidden text: …]`.

**The script re-records the frozen fixtures.** It overwrites `tests/fixtures/phase-3-exit/`. Run `git restore tests/fixtures` afterwards unless you mean to replace the recorded run.

## Harden (ticket 54)

TraceVault does not block. `harden` makes OpenCode's own settings ask before risky calls instead.

```bash
node dist/cli/index.js harden --dir <project>
node dist/cli/index.js harden --dir <project> --undo
```

**Expected:**
- The output lists each permission it changed, such as `bash: allow → ask`.
- It ends with "the static rules find nothing risky in the hardened file", or names what is still risky. Anything still risky is set in an agent's own block, which harden leaves for you to change.
- `--undo` puts the original `opencode.json` back byte for byte.

## Phase 3 known limitations

These are listed in `docs/spec/phase-3.md` under Known Blind Spots:
- A secret written literally in the configuration is not detected.
- Tool text is checked for local MCP servers only, not for remote servers, built-in tools or plugin tools.
- Tool-poisoning patterns are easy to evade.
- OpenCode's defaults were read from version 1.18.32. A later version can change them.

# Phase 4 — the session report

**What it shows:** one session as one HTML file that someone with no IT background can read without TraceVault. It opens with "In short", then lists the actions the safety check skipped, what the agent did that needs a look, what its settings allow without asking, everything that happened grouped by kind, any gap in the record, and a glossary. Each risk has a plain title, says what to do, and links to the recorded actions behind it.

Run the Phase 1 demo above first, so the database holds a real session. Then find its id on the session list, or with `sqlite3 data/demo.db "SELECT DISTINCT session_id FROM events"`.

**From the CLI:**

```bash
node dist/cli/index.js report <session-id> --db data/demo.db --out /tmp/tv-report.html
open /tmp/tv-report.html
```

The command never overwrites a file and never creates a database. It fails with a message for an unknown session.

**From the dashboard:** open the session and click "Export report" in the header. The download is byte-for-byte the file the CLI writes.

**Check:**
- The header names the session, agent, start, end and event count.
- "In short" says in a few sentences what happened.
- Every risk has a plain title and "What to do", or the section says plainly that nothing matched. A session without recorded settings says they are not known, never that they were safe.
- Each event link jumps to its row in "Events by type".
- The file opens with the network off, and the browser's print saves it as PDF.

**Last run (12 Nov 2026):**
- OpenCode 1.18.32 and `deepseek/deepseek-flash`, the Phase 1 prompt above, in a workspace installed with `init --block`.
- The session holds the shell call, the read and write of `demo.txt` and the fetch, all done. No workflow rule matched; the report says so.
- The workspace has no `permission` block, so OpenCode's permissive defaults apply. The report lists 3 risks in its settings (`shell-unrestricted`, `read-and-egress`, `config-self-edit`), each naming the built-in agents it applies to.
- After reading the first version, Kevin asked for a report someone with no IT background can follow, then for a shorter one with details behind "Explain more", then for a cleaner layout (ticket 52). He confirmed the final version is easy to follow.
- The CLI file and the "Export report" download were byte-for-byte identical, with no script, stylesheet link or external URL.
- An earlier session in the same workspace had an edit of `opencode.json` skipped by the guard; its report lists that call first, under "1 skipped call".

**Titles and recommendations** live in each rule file as `title:` and `recommendation:`, beside `explanation:`. The session page shows them too, and lists skipped calls above the findings when `init --block` is on.

## Phase 4 known limitations

These are listed in `docs/spec/phase-4.md` under Known Blind Spots:
- The report holds command text and paths as recorded. Sharing it shares them.
- A recommendation is general advice per rule, not advice about this session.
- The header names the rule-set digest only when some rule matched.
