# 89 — The first connection to an unknown host is flagged

**What to build:** A new rule, `new-host`, flags a session's first connection to a host that is not on `rules/lists/known-hosts.yaml` (package registries and code hosts, matched by name pattern). Each unknown host is flagged once per session. It is the last proxy ticket on purpose: if it proves noisy, it is dropped without touching 86 to 88.

Spec: `docs/spec/shell-proxy.md`; Kevin decided to build it, 16 Nov 2026.

**Blocked by:** 88.

**Status:** open

- [ ] A connection to an unlisted host raises `new-host` once, however many times the session connects to it (Seam C)
- [ ] A connection to `registry.npmjs.org` or `pypi.org` raises nothing (Seam C clean rows)
- [ ] The rule carries an explanation and a recommendation, like every rule
- [ ] The false-positive audit script counts it, and Kevin's run of the audit is recorded here
- [ ] Typecheck, build and the full suite pass
