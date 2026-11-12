# 47 — Report tracer bullet: one session, one HTML file

**What to build:** `tracevault report <session-id> [--db <path>] --out <file>` writes a self-contained HTML report (ADR 0005) with the header, the events grouped by type with `id` anchors, and the gaps and guard failures section. `ReportView` lives in `src/dashboard/` and reads only `InvestigationServicePort`; `ReportCommand` lives in `src/cli/`. Findings come in 48 and 49.

**Blocked by:** — (Phase 4 spec approved)

**Status:** done

- [x] The file holds the header (session, agent, start, end or open, event count, rule-set digest) and every event grouped by type, in timeline order (Seam A against a temporary database)
- [x] Gaps and guard failures are listed with their reasons; "No gaps recorded" when there are none
- [x] No `<script>`, and no `http:`, `https:` or `//` URL in an attribute
- [x] Rendering the same session twice gives identical bytes
- [x] The command refuses an existing output file and fails for an unknown session, both with a message and a non-zero exit
- [x] `ReportView` imports neither `store/` nor `capture/`
- [x] Typecheck, build and the full suite pass

**Technical notes:** `ServiceAssembly` (new, `src/cli/`) now builds the service for both `run` and `report`, so the two cannot drift. The header names the rule-set digest only when some rule matched, because the digest comes from a finding (`shortcut:` comment in `ReportView`). Test: `tests/seams/report.seam.test.ts`.
