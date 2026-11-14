# 57 — A session under the rules then and now

**What to build:** the service stores every rule set it uses, by digest, and the digest current when each session's first event was stored. Findings and configuration findings can be computed under a stored digest. The session page and the report show today's rules, with one plain line and a `?rules=then` link when the rules from when the session was recorded say something different. A session recorded before this feature says those rules were not kept.

**Blocked by:** 55, 56

**Status:** done

- [x] Findings under a stored digest equal findings from loading the same files from disk (Seam C)
- [x] A session recorded under rule set A and viewed under B shows B, the notice, and A under `?rules=then` (Seam A)
- [x] The report offers the same choice
- [x] A session without a recorded rule set says the rules from that time were not kept
- [x] Typecheck, build and the full suite pass

**Technical notes:** Migration 2 adds `rule_sets` and `session_rules`; `SqliteRuleSetStore` reads and writes them. `StoredRuleHistory` (composition root) stores today's rule set when the service starts and rebuilds an older one's scanners by writing its files to a temporary folder and loading them with the existing loaders. `SessionRules` (service) picks "now" or "then" for findings, configuration findings and the timeline's flags, and compares the two. The page shows `RulesNoticeView`; the report takes `--rules now|then` and `?rules=then`. Test: `tests/seams/rules-then.seam.test.ts`.
