# 38 — Ungoverned grants: a default question answered in advance

**What to build:** A rule, `default-ask-removed`, flags a configuration that answers "allow" in advance to a question OpenCode asks by default. There are three such questions, one label each: reading a `.env` file, touching a folder outside the project, and repeating the same call (`doom_loop`). The finding names which safeguard was switched off and where.

**Blocked by:** 36.

**Status:** done

- [x] Each of the three labels fires in the trigger fixture, and each piece of evidence points at the entry that turned "ask" into "allow"
- [x] A configuration that leaves all three at OpenCode's default produces no finding, and neither does one that turns them to "deny"
- [x] A temporary-folder allowance is not reported as a removed question, because the outside-folder example is not in a temporary folder. The clean fixture allows `/tmp/*` to show it
- [x] Source: least-privilege baseline. A rule has one source, so the `.env` label does not cite OWASP MCP01 separately
- [x] Seam C trigger and clean fixtures
- [x] `npm run build`, `npm run typecheck` and `npm test` all pass

**Implementation notes (11 Nov 2026):**
- **Rule format.** Adds `any`, whose alternatives carry labels, and `configured: true` on `allows`, which counts only an allowance the configuration made. Without it, OpenCode's own explore agent would be reported, because it reads `.env` without asking by default. A Seam C test checks that premise and that the default configuration stays silent.
- **Targets.** They follow OpenCode's own questions: `.env` for reads, `/etc/*` for a folder outside the project (OpenCode asks with `<dir>/*`), and the tool name `bash` for a repeated call.
- **Evidence.** A finding now lists evidence, one item per alternative that held, each with its label and its entry, so a finding names every switched-off question and where. This replaced the single example and entry that ticket 36 shipped.
