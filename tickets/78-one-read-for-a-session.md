# 78 — One call returns everything about a session

**What to build:** The session page, the report and the configuration page each assemble one session from five or six calls on the investigation service's interface: the session list (which scans the whole database to find one summary), the timeline twice, the findings, the configuration findings, the rule versions. Each call reads the session's events again, and each caller must know which calls take the "rules then or now" choice. One call returns a session's whole view for a rule choice and a filter: its summary, the shown and the full timeline, the workflow findings, the configuration and its findings, and whether the old rules agree. The three callers only read the result, so the page and the report cannot disagree.

Refactor: the rendered pages and the report keep their bytes. From the 15 Nov 2026 architecture review, candidate 1.

**Blocked by:** 77 (so the tests change once, at the assembly, not in 23 files).

**Status:** done

- [x] The session page, the report and the configuration page are each built from one call for the session
- [x] That call reads the session's events from the store once, and does not read other sessions' events to find the summary
- [x] The service's interface no longer offers the separate per-part reads the three callers used; the live stream keeps what it needs
- [x] The report from the CLI and from the page are still byte-identical, under today's rules and under the recorded ones
- [x] A session that does not exist is still a 404 on every route, and an error from the report command
- [x] `measure-scale.mjs` is rerun and the session-page and report rows in `docs/probes/scale-measurements.md` are updated
- [x] Typecheck, build and the full suite pass

**Notes (16 Nov 2026):** `InvestigationServicePort.getSession(id, rules, filter)` returns a `SessionView` (`src/service/SessionView.ts`); `getFindings`, `getRuleVersions`, `getConfiguration` and `getConfigFindings` are gone, and `getTimeline` stays for the live stream. The call reads the session's events once. It also runs the store's session-list query (no event bodies) for the summary's counts, the previous and next session and the subagents, reads each subagent session for its card's duration, reads the filtered rows when a filter is on, and reads every session's `mcp.tools` events, which `tool-changed` needs as its baseline. The configuration page now pays for the workflow findings too, which are cached. Pages and reports of six probe databases, under both rule choices, kept their bytes.
