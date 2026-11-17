# 89 — The first connection to an unknown host is flagged

**What to build:** A new rule, `new-host`, flags a session's first connection to a host that is not on `rules/lists/known-hosts.yaml` (package registries and code hosts, matched by name pattern). Each unknown host is flagged once per session. It is the last proxy ticket on purpose: if it proves noisy, it is dropped without touching 86 to 88.

Spec: `docs/spec/shell-proxy.md`; Kevin decided to build it, 16 Nov 2026.

**Blocked by:** 88.

**Status:** done (17 Nov 2026).

**Audit (17 Nov 2026, Kevin's run on ticket 87's live database, 44 sessions, 43 of them imported history with no proxy):** `new-host` 1 finding in 1 session, `example.com:443`, which is correct: it is not a registry or code host. The same session's `github.com:443` raised nothing. One proxied session says nothing about noise in daily use; rerun the audit on a database recorded with the plugin over a few days of real work, and drop the rule if it is noisy.

- [x] A connection to an unlisted host raises `new-host` once, however many times the session connects to it (Seam C)
- [x] A connection to `registry.npmjs.org` or `pypi.org` raises nothing (Seam C clean rows)
- [x] The rule carries an explanation and a recommendation, like every rule
- [x] The false-positive audit script counts it (done: every rule is listed, a silent one with 0), and Kevin's run of the audit is recorded here
- [x] Typecheck, build and the full suite pass

**Built (17 Nov 2026).** `rules/new-host.yaml` (low) and `rules/lists/known-hosts.yaml`. The rule language could not say "not on a list" or "once per host", so the engine gained the smallest pieces that do: a `host` fact, a `not_glob` operator, and a rule key `once_per` (documented in `docs/spec/phase-2.md`, with a loader test). A host counts on any port and whether or not the connection opened. Imported history has no proxy connections, so the audit counts new-host only on a database recorded with the proxy:

    npm run build
    node docs/probes/scripts/false-positive-audit.mjs <path to tracevault.db>
