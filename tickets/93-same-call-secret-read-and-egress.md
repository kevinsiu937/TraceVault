# 93 — A secret read and connection within one bash call do not lose their warning

**What to build:** TraceVault reports possible exfiltration when evidence associates a sensitive shell read and an opened proxy connection with the same bash call, even though the connection hook arrives before the completed bash hook. The timeline and report expose the actual evidence and its limits without claiming that a secret was certainly transmitted.

**Blocked by:** None. Follow-up to tickets 44 and 88 and the implemented per-call proxy path from 86 and 87. The additional local regression does not require Kevin's pending live sign-off for 87; that sign-off remains a separate requirement.

**Status:** pending

**Priority:** P2.

**Evidence:** A single bash call first reads an environment secret into a temporary payload, then runs a Python uploader. The proxy emits its connection while bash is running; the shell-read evidence arrives only when bash completes. Passing this real hook order through capture and scanning produces a new-host warning and a shell-sensitive-read warning, but no exfiltration-chain finding. The control sequence, with the read in a separate completed call before the connection, does produce the chain finding. The reproduction used synthetic hook payloads and performed no upload.

**Demo:** Replay a frozen sequence with the connection hook before the completion hook for a bash call that names a sensitive read and performs an opened connection. The session and exported report show the possible-exfiltration finding with links to the correct call and connection.

- [ ] Start with a failing Seam B/C regression in the observed hook order. Do not rearrange fixture events merely to make the existing scanner pass.
- [ ] A single call with explicit read-before-connection evidence raises the intended possible-exfiltration finding, naming its shell and connection evidence.
- [ ] Associate evidence by session and call identity. An unrelated later read, a different call or another session must not consume an earlier connection as its own exfiltration evidence.
- [ ] Define and document how ambiguous order, a connection before a read and background connections are represented. Timing that capture cannot establish must not be presented as a proven read-then-upload sequence.
- [ ] A refused upstream connection is not successful egress, and a call with no sensitive-read evidence produces no new exfiltration-chain finding.
- [ ] Existing separate-call detection, rule time windows, duplicate handling and per-host new-host behavior continue to pass their Seam C fixtures.
- [ ] The session page and report expose the finding and its evidence through Seam A; the connection remains associated with its owning bash call.
- [ ] Use recorded or synthetic local hook sequences in the gate. Do not run a real agent, upload credentials, add wall-clock sleeps or require internet access.
- [ ] Keep the proxy record-only and preserve event bodies and capture provenance. Any decision that changes stage observability or file structure is presented before implementation.
- [ ] Typecheck, build and the full suite pass locally.
