# 80 — A reversible file change is written once

**What to build:** `init`, `harden` and `uninstall` each save a file's original bytes, write new ones, and later put the original back or delete what they created. The rule that makes this safe, that a second run must keep the first run's original, lived in `harden` and not in `init`, which is why running `init` twice left the plugin behind after `uninstall` (fixed in ticket 68 by copying the rule). The install manifest is only a record with save, load and delete; the rule sits in its three callers. The manifest becomes the thing that owns the change: apply new content to a file keeping the earliest original, say whether a change is in place, and undo it byte for byte.

Refactor: no behaviour changes. From the 15 Nov 2026 architecture review, candidate 4.

**Blocked by:** None (can start immediately). Touches the same command files as 79; do one at a time.

**Status:** ready-for-agent

- [ ] `init`, `harden` and `uninstall` no longer read or write the saved original themselves
- [ ] Applying twice and undoing once restores the earliest bytes, for a file that existed and for one that did not (Seam B, through `init` and through `harden`)
- [ ] The manifest files already on users' disks from earlier versions still undo correctly
- [ ] Every existing install and harden test passes unchanged
- [ ] Typecheck, build and the full suite pass
