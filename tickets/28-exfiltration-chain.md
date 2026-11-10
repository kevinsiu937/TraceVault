# 28 — Exfiltration chain: a sensitive read, then data leaves

**What to build:** The first multi-step rule. `exfiltration-chain` matches a read of a sensitive file (`.env*`, `*.pem`, `*.key`, SSH keys, cloud credential files, `secrets/`) followed, inside the window, by an outbound request: a `webfetch`, a shell command that matches a known egress pattern (`curl`, `wget`, `nc`, `scp`, `Invoke-WebRequest` and similar), or an MCP call. Both rows carry the flag.

This ticket proves the scanner holds partial matches across events and closes each one once.

**Blocked by:** 27.

**Status:** done

- [x] Reading `.env` then running `curl` flags both rows with one `exfiltration-chain` finding
- [x] Seam C, prefix by prefix: no finding until the closing event, then exactly one
- [x] A `.env` read followed by two `curl` calls yields two findings, one per egress (changed on review, 10 Nov 2026; it was one)
- [x] Clean fixtures stay silent: the read alone, egress before the read, denied egress, egress outside the window
- [x] The finding names the egress pattern that matched
- [x] On a live session, the earlier read row gains the flag when the closing event arrives, with no reload. The stream pushes server-rendered rows, so one Seam A live-stream case can assert it
- [x] The sensitive path list is a named list under `rules/lists/`, referenced by name from the rule; the loader rejects an unknown list name
- [x] Seam A: the flag attaches to both events of the chain

**Technical notes:** Shell egress is a pattern over command text and is easy to evade; the explanation says "possible exfiltration", never more. Treating every MCP call as egress may be noisy. If real sessions show that, narrow it to named servers in the rule file, not in code.

**Implementation notes (7 Nov 2026):**
- Rules now take several steps and a `window: { seconds: n }`, which is required once there are two or more. A step is either `match` or `any`, a list of labelled alternatives. The finding carries the labels that matched in `matched`, and the panel shows them as "via shell egress".
- `RuleMatcher` holds one rule's partial matches for one scan. A partial match expires outside the window and closes exactly once. Two sensitive reads before one egress therefore give two findings, each naming its own read.
- The sensitive path list lives in `rules/lists/sensitive-paths.yaml` and is referenced as `{ list: sensitive-paths }`. Lists are loaded before rules and covered by the rule-set digest. The rules seam iterates only top-level `rules/*.yaml`, so lists need no fixtures.
- New fact `tool`: a hook script's `target_tool`, or an MCP call's tool name. New operator `regex`, which ignores case and fails loading when it does not compile.
- Rules seam: every rule's trigger fixture is now checked prefix by prefix. A finding must appear exactly when its last event arrives.
- Live: each stream message carries `updates`, the server-rendered rows whose flags changed. The page swaps them in. Headless Chrome confirmed a streamed `curl` flags the earlier `.env` row. The findings panel itself refreshes on reload.
- The page seam pins that a filter hiding the `.env` read keeps the flag on the `curl` row. Deletion checks for this ticket all fail the suite.
- Fixtures are authored. Ticket 33 records a live chain.
- Review fix (11 Nov 2026, C5): a flag change was lost live in two cases. When a filter hid the closing event, the stream sent nothing, so a shown row missed its new flag. A flagged call inside a collapsed run updated only its own row, so the run's header kept the old flags. Now the stream sends an updates-only message for a filtered-out closer, and an update for a call in a collapsed run also carries the run, redrawn; the page swaps the whole run when it still holds exactly those calls, and keeps it open if it was. Two Seam A live tests cover them, and a cockpit test checks that the page's inline scripts parse. Headless Chrome confirmed both cases.

**Review fix (10 Nov 2026):** A harmless MCP call right after a sensitive read closed the chain, so a later `curl` inside the window went unflagged. The egress step now says `each`, so every egress inside the window is its own finding. Kevin chose this over keeping one finding per read, and the spec's matching paragraph now says so. A denied egress never ran and no longer counts, so the recorded DeepSeek run's denied `wget` and `nc` stay unflagged. The 7 Nov note that two sensitive reads before one egress give two findings no longer holds. Since the duplicate fix in ticket 30, one event closes only the oldest open match, so that finding names the earlier read. The trigger fixture now has two `curl` calls after `.env`. In a later window, it has an SSH key read followed by an MCP call and a `curl`. The clean fixture adds a denied `curl`, a denied webfetch and a denied MCP call. Removing `each`, or the denied check on any of the three kinds of egress, fails the suite.
