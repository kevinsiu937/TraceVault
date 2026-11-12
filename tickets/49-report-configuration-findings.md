# 49 — Report: configuration findings

**What to build:** the report gains the configuration findings: rule, severity, source with its identifier, subject, configuration entry and recommendation. A session without a snapshot says "No configuration recorded", which is distinct from "No configuration findings".

**Blocked by:** 45, 47

**Status:** done

- [x] The Phase 3 misconfigured fixture's report lists every configuration rule it raises, with source, subject, entry and recommendation (Seam A)
- [x] The Phase 3 clean fixture's report says "No configuration findings"
- [x] A session with no snapshot says "No configuration recorded"
- [x] Secret values appear only as `[redacted]`
- [x] Typecheck, build and the full suite pass

**Technical notes:** The list is the Configuration view's own (`ConfigurationView.findings`), so the page and the report cannot drift.
