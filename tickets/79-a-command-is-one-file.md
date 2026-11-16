# 79 — A CLI command is one file

**What to build:** The CLI entry point changed in 13 of 58 commits. It is one chain of `if` blocks, seven commands long, beside a hand-written usage text, and the option parser holds one record with every command's flags mixed together (port, database, folder, block, out, undo, rules, harden). Adding `verify`, `--port` and `--no-harden` each edited the same two files. This is the growing switch the working agreement forbids. Each command declares its own name, flags, usage lines and run; the entry point looks the command up in a table and turns its result into an exit code. A new command is a new file and one line in the table.

Refactor: every command line that works today works the same, with the same output and exit code. From the 15 Nov 2026 architecture review, candidate 2.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Each command owns its flags; a flag another command takes is still refused with the same "unknown option" message
- [ ] The usage text is assembled from the commands, and reads as it does today
- [ ] The entry point holds no command-specific branch
- [ ] Every existing CLI test passes unchanged (install, harden, report, verify, the refused-arguments table)
- [ ] Adding a command touches one new file and the table; the ticket's notes name the two places
- [ ] Typecheck, build and the full suite pass
