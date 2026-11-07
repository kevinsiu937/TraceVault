# 28 — Exfiltration chain: a sensitive read, then data leaves

**What to build:** The first multi-step rule. `exfiltration-chain` matches a read of a sensitive file (`.env*`, `*.pem`, `*.key`, SSH keys, cloud credential files, `secrets/`) followed, inside the window, by an outbound request: a `webfetch`, a shell command that matches a known egress pattern (`curl`, `wget`, `nc`, `scp`, `Invoke-WebRequest` and similar), or an MCP call. Both rows carry the flag.

This ticket proves the scanner holds partial matches across events and closes each one once.

**Blocked by:** 27.

**Status:** blocked (see Blocked by)

- [ ] Reading `.env` then running `curl` flags both rows with one `exfiltration-chain` finding
- [ ] Seam C, prefix by prefix: no finding until the closing event, then exactly one
- [ ] A `.env` read followed by two `curl` calls yields one finding, not two
- [ ] Clean fixtures stay silent: the read alone, egress before the read, egress outside the window
- [ ] The finding names the egress pattern that matched
- [ ] On a live session, the earlier read row gains the flag when the closing event arrives, with no reload. The stream pushes server-rendered rows, so one Seam A live-stream case can assert it
- [ ] The sensitive path list is a named list under `rules/lists/`, referenced by name from the rule; the loader rejects an unknown list name
- [ ] Seam A: the flag attaches to both events of the chain

**Technical notes:** Shell egress is a pattern over command text and is easy to evade; the explanation says "possible exfiltration", never more. Treating every MCP call as egress may be noisy. If real sessions show that, narrow it to named servers in the rule file, not in code.
