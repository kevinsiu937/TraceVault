# 45 — Every finding says what to do about it

**What to build:** a required `recommendation` field in every rule file, workflow and configuration alike. Both loaders reject a rule without one. `Finding` and `ConfigFinding` carry it, and the Findings panel and the Configuration view show it under the explanation. Write the text for all sixteen rules; Kevin reviews the wording.

**Blocked by:** — (Phase 4 spec approved)

**Status:** done

- [x] A rule file without `recommendation`, or with an empty one, fails to load and the error names the file (Seam C)
- [x] Every rule in `rules/*.yaml` and `rules/config/*.yaml` yields findings with a non-empty recommendation (Seam C loops)
- [x] The Findings panel shows the recommendation under each finding (Seam A)
- [x] The Configuration view shows the recommendation under each finding (Seam A)
- [x] Kevin has reviewed the sixteen texts (rewritten in plain words in ticket 52; Kevin approved the report on 12 Nov 2026)
- [x] Typecheck, build and the full suite pass

**Technical notes:** Rule versions do not change; what a rule matches is untouched. Spec: `docs/spec/phase-4.md`, Recommendation.
