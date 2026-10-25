# Rules for AI coding agents working in this repository

> Intended to be copied to `AGENTS.md` at the repo root so OpenCode reads it automatically. Kept here because the root filename is user-protected on Kevin's machine.

TraceVault is itself an AI-agent observation tool. Agents working here are bound by the same discipline it exists to provide.

## Source of truth

The submitted FYP proposal (30 Sep 2026) is the binding spec. If code and proposal disagree, the proposal wins until Kevin changes it explicitly. Read before building:

- `docs/EVENT-SCHEMA.md` — build this **first**; every stage depends on it
- `docs/ARCHITECTURE.md` — component boundaries, what each stage may and may not do
- Vault (outside this repo): `D:\hermes\obsidian-vault\CUHK\IE FYP\TraceVault-v5-Plan.md`

## Hard constraints from the proposal

1. **Semester 1 is stages 1–4.** Logger, Vulnerability Scanner, Workflow Scanner, Investigator, then Report Generator. The Simulator is Semester 2 — do not build it, do not stub it into the critical path.
2. **No machine learning, ever.** Scanner rules are YAML data files with explicit conditions. Every flag must trace to a named rule.
3. **Loopback only.** The service binds `127.0.0.1`. No listening on `0.0.0.0`, no outbound telemetry, no analytics.
4. **Never log a secret value.** Log the key's name/reference, never the material.
5. **Captured events are append-only.** Each store entry carries the hash of the previous entry. Never mutate or delete a stored event; corrections are new events.
6. **Honest gaps.** If a capture path cannot see something, the investigator shows a gap rather than implying coverage.
7. **Agent-agnostic core.** OpenCode is the reference implementation, not the architecture. Keep agent-specific code behind an adapter; no OpenCode identifiers in the schema, the store, the scanners or the report.

## Engineering rules

- TypeScript, ESM, strict mode. No `any` in exported signatures.
- Every scanner rule ships with **two fixtures**: one that must trigger it, one that must not.
- Tests are the deliverable, not an afterthought: a rule without fixtures is not done.
- No new dependency without a one-line justification in the commit message. Prefer the standard library and the official MCP SDK.
- Conventional commits (`feat(logger): ...`, `fix(store): ...`, `docs(schema): ...`), one logical change each.
- Never commit credentials, `.env`, session dumps, or agent transcripts containing real paths from a user's machine.

## Working style with Kevin

- Report what changed and what is next. No auto-advancing past a phase boundary.
- Do not silently widen scope. If the proposal does not cover it, ask.
- If a design decision is genuinely load-bearing, write an ADR in `docs/adr/` instead of burying the rationale in code comments.
