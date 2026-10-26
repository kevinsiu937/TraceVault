# 15 — Gate on shared pushes (CI)

**What to build:** The pre-commit hook pins the gate locally, but a two-person team can still land commits that never ran it — a machine without the hook, or a `--no-verify` bypass. A GitHub Actions workflow runs typecheck + the vitest suite on every push and PR to `main`, so the gate is pinned wherever a commit lands, not just on the authoring machine.

**Blocked by:** none — the suite already passes on a clean clone (typecheck clean, 50/50 tests across 7 seam suites).

**Status:** ready-for-agent

- [x] `.github/workflows/ci.yml` runs `npm ci`, `npm run typecheck`, `npm test` on push and PR to `main`, on ubuntu-latest with Node 24
- [x] The check fails when the suite fails — no `continue-on-error`, no skip on PR-only triggers
- [ ] The fixture `opencode.db` stays byte-identical after the suite runs on CI (the history-import seam already asserts this locally; CI proves it cross-platform) — waiting on the first CI run
- [ ] A red PR is visible in the checks panel — the demo is "push a breaking change, watch the gate stop it" — waiting on a push
- [ ] Optional: build status badge in README, one line
