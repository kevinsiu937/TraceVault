# Spec: closing rule-evasion gaps before Phase 5

> Status: approved 13 Nov 2026. Binding until superseded.
> Kevin decided on 13 Nov 2026:
> - shell egress is found by the parsed program, from a list, instead of a text pattern; whether the agent's shell can be routed through a local proxy is probed first (ticket 64), and the proxy itself (65) waits on that probe;
> - MCP tools are trusted when first seen, and a later change is a finding;
> - the rules are validated by a live probe script and by a false-positive audit over his local OpenCode history, both run by Kevin. The audit prints counts; command text appears only in his terminal, with `--show`, and never in the repository;
> - all of this goes after tickets 55 to 59 and before Phase 5.
> Tickets: `tickets/60-*` to `tickets/66-*`. Builds on tickets 53 and 54 (`docs/spec/phase-2.md`, `docs/spec/phase-3.md`).

## Problem Statement

Tickets 53 and 54 made evasion visible and let OpenCode do the blocking, but six gaps remained:

1. Data leaving the machine was found by command text, so an unlisted tool, or a listed one behind `sudo -u`, or by its full path, went unseen.
2. The command parser did not expand variables or understand wrappers that take a value, so `$RUN -c x` and `sudo -u root cmd` misled it.
3. A file written by the shell (`echo … > run.sh`, `curl -o`) was not a write, so running it was not flagged.
4. "Ran the file it wrote" compared the ends of paths, so `bash build.sh` matched any written `…/build.sh`.
5. Tool poisoning was found by text patterns only, so a server that changed its tools after being trusted, in other words, went unseen.
6. The new rules were proven by authored fixtures only.

## Solution

The parser grows into a small, honest shell reader: words (`ShellWords`), then commands (`ShellCommandLine`) with their program, arguments, input, written files and the folder earlier `cd`s moved them to. Rules use it through operators. A computed program name is treated as opaque rather than guessed.

Every rule match also starts out knowing the session's project folder, so a script path can be resolved in full. Where it cannot, the match says "probable".

Static rules gain a check that compares a tool with the first tool list its server ever sent.

Scripts let Kevin run the agent for real and audit the rules against his own history.

## User Stories

1. As a developer, I want a command whose program is a variable flagged, so that hiding the program in `$X` does not hide the command.
2. As a developer, I want `sudo -u root bash -c …` read as `bash -c`, so that a wrapper does not hide what runs.
3. As a developer, I want code fed to an interpreter through a here-document flagged, and a here-document that only writes a file not flagged.
4. As a developer, I want a script written by the shell and then run flagged, as a script written by the edit tool is.
5. As a developer, I want a script written and run in one command flagged.
6. As a developer, I want `bash build.sh` matched to the exact file the agent wrote, not any file of that name, and told when the match is only by name.
7. As a developer, I want `curl` found as a program, wherever it sits in the line, and a command that only mentions it as text not found.
8. As a developer, I want to know whether TraceVault can see where the agent's shell connects, before anyone builds a proxy.
9. As a developer, I want a tool whose description or schema changed since its server was first used flagged, whatever its wording.
10. As a developer, I want to see the rules fire on a real agent run.
11. As a developer, I want to know how often each rule fires on my real sessions, without my commands leaving my machine.

## Implementation Decisions

**Parser.** `ShellWords` splits a line: quotes and escapes are honoured; `;`, `&&`, `||`, `|`, `&` and new lines separate commands; `$( … )` and backticks are read as commands too; here-document bodies are skipped, with a `<<` marker left behind. `ShellCommandLine` interprets each command:
- leading `VAR=value` words and the wrappers `sudo`, `doas`, `env`, `command`, `exec`, `nohup`, `time`, `nice` and `timeout` are skipped, with the values their flags take (`sudo -u root`, `env -u X`, `nice -n 10`, `timeout -s KILL 30`, `time -o f`);
- redirections leave the arguments: `>`, `>>`, `&>` targets are written files (not `/dev/null`, not `>&`), and `<` names the input;
- `piped` is true when the input comes from the line itself: a pipe, a here-document or a here-string;
- `computed` is true when the program's name starts with `$` or holds a backtick;
- `writes` adds `tee` operands, `curl -o`/`--output`, `wget -O`/`--output-document`, and the destination of `cp`, `mv` and `install`;
- `dir` is where earlier `cd`/`pushd` in the line moved the command, or unknown after `cd`, `cd -`, `cd ~` or `cd $X`.

**Operators.** `invokes` gains the entry `$` (a computed program). `runs` resolves both paths in full; `runs_by_name` is the by-name fallback, used only when a full path cannot be worked out. `writes` tests written files against globs. `runs_own_write` finds a write and a later run in one line. The workflow scanner seeds every match with `session.project` from the session's start.

**Rules.**
- `opaque-execution` v2 adds the `$` entry; here-documents and wrappers reach it through the parser.
- `runs-written-file` v2 starts on an edit-tool write or a shell write, and ends on a run (full path) or a probable run (by name).
- `runs-own-write` v1 is the one-command case, which a two-step rule cannot see because one event satisfies one step.
- `exfiltration-chain` v2 finds shell egress with `invokes` over `rules/lists/network-programs.yaml`.
- `tool-changed` v1 (static) uses the new check `changed_since_first_seen`.

**First-use trust without a new table.** A server's first tool list is its earliest `mcp.tools` event, which the append-only store already keeps. The service passes every recorded `mcp.tools` event to the static scanner, which compares each tool with its server's first list. A second copy in its own table could disagree with the record and would need a backfill for old databases; this way, old databases work as they are. The consequence is that ticket 59 (archive) must keep each server's first tool list in the main database.

**A change within the first session counts.** The plugin sends a server's tool list again only when it changes, so a second, different list inside one session is a change. Only the very first list is trusted.

**Probes, not guesses.**
- **Ticket 62:** whether every bash call starts in the project folder decides whether full paths are right. OpenCode 1.18.32's plugin types offer a `shell.env` hook whose input carries `cwd`. The probe logs it, along with each call's arguments and output.
- **Ticket 64:** the same `shell.env` hook may set environment variables for the shell. The probe sets `HTTPS_PROXY`, `HTTP_PROXY` and a marker, and the agent prints exactly those three variables, so no other variable, and no API key, reaches the model.

## Testing Decisions

- **Unit table** for `ShellCommandLine`, a value object with rules worth pinning: splitting, wrappers, here-documents, here-strings, computed names, written files, input and `dir`.
- **Seam C:**
  - authored trigger and clean fixtures for `opaque-execution`, `runs-written-file`, `runs-own-write` and the extended `exfiltration-chain`;
  - a probable match when the project folder is unknown;
  - loader rejections for every new operator and check.
  - Each new behaviour was checked by breaking it, for example: paths compared by name only, here-documents not skipped, the old egress regex, the tool baseline dropped.
- **Seam C (static):** `tool-changed` trigger and clean fixtures, with an optional `firstSeen` field holding an earlier session's tool lists.
- **Seam B:** tool trust through the real capture path:
  - a first sighting raises nothing;
  - a later change names the server, the tool and what changed, and still does after the database is reopened;
  - a change within the first session counts;
  - a removed tool raises nothing.
- **Live (Kevin):** `evasion-exit-run.sh` freezes `tests/fixtures/rules/evasion-exit/trigger.json`. The Seam C block for it is skipped until that file exists.

## Out of Scope

- The proxy itself (ticket 65) until the ticket 64 probe says the shell inherits `shell.env`.
- Expanding variables, aliases or functions; a full shell grammar.
- Writes by programs other than the listed ones (`python3 -c "open(...)"`, `dd of=`, `sed -i`).
- Accepting a changed tool, so it stops being reported. Today every later session reports it again.
- Remote MCP servers, whose tool lists are not recorded.

## Known Blind Spots

- **Parser:**
  - an alias or shell function for `bash -c` is not seen;
  - a wrapper or wrapper flag not in the table can still mislead;
  - a quoted `">"` argument is read as a redirection.
- **Folders:** a `cd` inside a subshell `( … )` is treated as if it moved the rest of the line.
- **Full paths:** the ticket 62 probe (15 Nov 2026, OpenCode 1.18.32) confirmed that each bash call starts in the project folder and that a `cd` lasts only for its own call, which is what full-path resolution assumes. A later OpenCode version could change this; the probe can be rerun.
- **Egress:** egress by a program not on the list is missed, and the finding still says "possible".
- **Tool changes:**
  - A server's first list is trusted, so a server that was poisoned from the start is left to the text-pattern rules.
  - Archiving the earliest sessions (ticket 59) would move the baseline unless the archive keeps each server's first tool list.
- **Audit:** the false-positive audit reads the history OpenCode keeps, which has no configuration, so it says nothing about the static rules.
