# 48 — Report: skipped calls and workflow findings

**What to build:** the report gains, after the header, the skipped-calls list (as on the session page) and the workflow findings: rule, severity, explanation, recommendation, and anchor links to each event behind the finding. Each event row names the rules that flagged it.

**Blocked by:** 45, 46, 47

**Status:** done

- [x] The Phase 2 exit trigger fixture's report lists its four rules, each with explanation and recommendation (Seam A)
- [x] Every finding link is an anchor that resolves to an event in the same file
- [x] A refused call appears under "Skipped calls" before the findings
- [x] "No workflow findings" when the session has none; no "Skipped calls" section when nothing was skipped
- [x] Typecheck, build and the full suite pass
