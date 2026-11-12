# 51 — Phase 4 exit verification

**What to build:** run the Phase 1 demo from `docs/DEMO.md` live, export its session with the CLI and with the link, and record the result in `docs/DEMO.md` as a Phase 4 part. Kevin runs the live session and judges whether a stranger can follow the report.

**Blocked by:** 46, 48, 49, 50, 52 (Kevin asked for a plain-language report after reading the first one)

**Status:** done

- [x] A live Phase 1 demo session exports a report from the CLI and from the link, and the two files are identical
- [x] The report opens from disk with the network off (checked by its content: no script, no stylesheet link, no external URL)
- [x] Kevin has read the report as a stranger would and confirms it can be followed (12 Nov 2026: "easy to follow")
- [x] `docs/DEMO.md` has a Phase 4 part with the commands and the recorded run
- [x] No real local path or username in anything committed
- [x] Typecheck, build and the full suite pass

**Progress (12 Nov 2026):** the live skip-probe session (`init --block`, `deepseek/deepseek-flash`) was exported from the CLI and from the link: identical bytes, the skipped `opencode.json` edit listed first with `self-modification` and its recommendation, ten configuration findings. The Phase 1 demo session (shell, edit, fetch) ran live the same day: CLI and link identical, no external reference, 0 workflow findings, 10 configuration findings from OpenCode's defaults.
