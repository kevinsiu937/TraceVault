# 30 — Destructive action after a declared freeze

**What to build:** `destructive-action` matches a user prompt that declares a freeze ("don't delete anything", "do not remove", "read-only from here") followed later in the session by a deletion. A deletion is a `document.access` delete or a shell command that matches a destructive pattern (`rm`, `git clean`, `git reset --hard`, `Remove-Item` and similar). The prompt and the deletion both carry the flag.

**Blocked by:** 28.

**Status:** blocked (see Blocked by)

- [ ] A freeze prompt followed by `rm` flags the prompt and the deletion with one finding
- [ ] A deletion with no freeze, or a freeze followed only by reads, produces no finding
- [ ] Harness-injected prompts never count as a freeze
- [ ] Seam C trigger and clean fixtures

**Technical notes:** Prompts are stored truncated at 200 characters, so a freeze phrase past that limit is invisible. Record it as a known false negative. Raising the cap is a capture change and needs Kevin. Ticket 22 already identifies harness prompts. The scanner must reach the same answer without importing the service, so that knowledge moves to a place both can read.
