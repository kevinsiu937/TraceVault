# 88 — Exfiltration through any program, and the hosts in the report

**What to build:** `exfiltration-chain` v3 accepts a `net.connect` as its egress step, so a sensitive read followed by a recorded connection is found whatever the command looked like, including through a computed program or a Python script. The report gets a "Hosts contacted" list: each host and port once, with the number of connections and the first call that made one.

Spec: `docs/spec/shell-proxy.md`, "Rules" and "Display".

**Blocked by:** 86.

**Status:** done (16 Nov 2026). Only a connection that opened counts as egress: one that never opened sent nothing (clean row). The long-session reference (`tests/fixtures/long-session-findings.json`) was regenerated, because it is built from this rule's trigger fixture; without the new rows it still matches the pre-82 reference exactly.

- [x] A sensitive read, then a `net.connect` from an opaque command, raises `exfiltration-chain` (Seam C trigger row)
- [x] A `net.connect` with no earlier sensitive read raises nothing (Seam C clean row)
- [x] Every earlier `exfiltration-chain` fixture row still holds
- [x] The report lists the hosts contacted, and a session without connections shows no empty section (Seam A)
- [x] The CLI report and the page report stay byte-identical
- [x] Typecheck, build and the full suite pass
