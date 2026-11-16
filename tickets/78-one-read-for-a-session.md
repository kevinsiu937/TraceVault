# 78 — One call returns everything about a session

**What to build:** The session page, the report and the configuration page each assemble one session from five or six calls on the investigation service's interface: the session list (which scans the whole database to find one summary), the timeline twice, the findings, the configuration findings, the rule versions. Each call reads the session's events again, and each caller must know which calls take the "rules then or now" choice. One call returns a session's whole view for a rule choice and a filter: its summary, the shown and the full timeline, the workflow findings, the configuration and its findings, and whether the old rules agree. The three callers only read the result, so the page and the report cannot disagree.

Refactor: the rendered pages and the report keep their bytes. From the 15 Nov 2026 architecture review, candidate 1.

**Blocked by:** 77 (so the tests change once, at the assembly, not in 23 files).

**Status:** ready-for-agent

- [ ] The session page, the report and the configuration page are each built from one call for the session
- [ ] That call reads the session's events from the store once, and does not read other sessions' events to find the summary
- [ ] The service's interface no longer offers the separate per-part reads the three callers used; the live stream keeps what it needs
- [ ] The report from the CLI and from the page are still byte-identical, under today's rules and under the recorded ones
- [ ] A session that does not exist is still a 404 on every route, and an error from the report command
- [ ] `measure-scale.mjs` is rerun and the session-page and report rows in `docs/probes/scale-measurements.md` are updated
- [ ] Typecheck, build and the full suite pass
