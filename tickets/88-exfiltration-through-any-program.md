# 88 — Exfiltration through any program, and the hosts in the report

**What to build:** `exfiltration-chain` v3 accepts a `net.connect` as its egress step, so a sensitive read followed by a recorded connection is found whatever the command looked like, including through a computed program or a Python script. The report gets a "Hosts contacted" list: each host and port once, with the number of connections and the first call that made one.

Spec: `docs/spec/shell-proxy.md`, "Rules" and "Display".

**Blocked by:** 86.

**Status:** open

- [ ] A sensitive read, then a `net.connect` from an opaque command, raises `exfiltration-chain` (Seam C trigger row)
- [ ] A `net.connect` with no earlier sensitive read raises nothing (Seam C clean row)
- [ ] Every earlier `exfiltration-chain` fixture row still holds
- [ ] The report lists the hosts contacted, and a session without connections shows no empty section (Seam A)
- [ ] The CLI report and the page report stay byte-identical
- [ ] Typecheck, build and the full suite pass
