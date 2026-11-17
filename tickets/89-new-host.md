# 89 — The first connection to an unknown host is flagged

**What to build:** A new rule, `new-host`, flags a session's first connection to a host that is not on `rules/lists/known-hosts.yaml` (package registries and code hosts, matched by name pattern). Each unknown host is flagged once per session. It is the last proxy ticket on purpose: if it proves noisy, it is dropped without touching 86 to 88.

Spec: `docs/spec/shell-proxy.md`; Kevin decided to build it, 16 Nov 2026.

**Blocked by:** 88.

**Status:** built; waiting on Kevin's audit run

- [x] A connection to an unlisted host raises `new-host` once, however many times the session connects to it (Seam C)
- [x] A connection to `registry.npmjs.org` or `pypi.org` raises nothing (Seam C clean rows)
- [x] The rule carries an explanation and a recommendation, like every rule
- [ ] The false-positive audit script counts it (done: every rule is listed, a silent one with 0), and Kevin's run of the audit is recorded here
- [x] Typecheck, build and the full suite pass

**Built (17 Nov 2026).** `rules/new-host.yaml` (low) and `rules/lists/known-hosts.yaml`. The rule language could not say "not on a list" or "once per host", so the engine gained the smallest pieces that do: a `host` fact, a `not_glob` operator, and a rule key `once_per` (documented in `docs/spec/phase-2.md`, with a loader test). A host counts on any port and whether or not the connection opened. Imported history has no proxy connections, so the audit counts new-host only on a database recorded with the proxy:

    npm run build
    node docs/probes/scripts/false-positive-audit.mjs <path to tracevault.db>
