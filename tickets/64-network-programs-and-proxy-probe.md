# 64 — Egress by program, and can the shell be routed through a proxy?

**What to build:**
- `rules/lists/network-programs.yaml` lists programs that can send data off the machine, DNS tools included.
- `exfiltration-chain` v2 finds shell egress with `invokes` over that list, so `sudo -u root /usr/bin/curl`, `dig $(…)` and `ssh` after a `cd` count, and a command that only mentions curl does not.
- `docs/probes/scripts/proxy-env-probe.sh` checks whether variables a plugin sets in OpenCode's `shell.env` hook reach the bash tool.

**Blocked by:** 60.

**Status:** done

- [x] The new trigger rows raise and the new clean rows stay quiet (Seam C); the old regex fails them
- [x] Every earlier `exfiltration-chain` fixture row still holds
- [x] The probe prints only the three variables it sets, so no API key reaches the model; it passes the probe-safety seam
- [x] Kevin ran the probe: does the bash tool inherit `shell.env` variables? (15 Nov 2026, OpenCode 1.18.32: yes. HTTPS_PROXY, HTTP_PROXY and a custom variable set in the plugin's `shell.env` hook all reached bash. The first run's script printed all three names in one command and judged only the custom one; the fixed script prints each separately)

**Open question:** OpenCode 1.18.32's plugin types (`@opencode-ai/plugin`, `index.d.ts`) declare `"shell.env"?: (input: { cwd; sessionID?; callID? }, output: { env }) => Promise<void>`. Whether the bash tool uses it is what the probe answers. Run:
`TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/proxy-env-probe.sh /tmp/tv-proxy`
