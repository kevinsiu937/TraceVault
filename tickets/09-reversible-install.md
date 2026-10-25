# 09 — One command to install, one to remove

**What to build:** Installing is one command and removing it puts the agent configuration back exactly as it was. Installation registers the plugin and its local endpoint with the agent; removal restores the pre-install state byte for byte, verified by comparison rather than by assumption.

Trying the tool must never feel like a commitment — that is a product requirement, not a convenience.

**Blocked by:** 01 — Walking skeleton.

**Status:** ready-for-agent

- [ ] One command attaches the instrumentation to the local agent
- [ ] One command removes it and leaves the agent configuration byte-identical to before installation
- [ ] Installation records what it wrote, so removal is exact rather than guessed
- [ ] Uninstalling and reinstalling works repeatedly with no residue
- [ ] A seam-B style test compares configuration before and after on a temporary copy
