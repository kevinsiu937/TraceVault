# 30 — Destructive action after a declared freeze

**What to build:** `destructive-action` matches a user prompt that declares a freeze ("don't delete anything", "do not remove", "read-only from here") followed later in the session by a deletion. A deletion is a `document.access` delete or a shell command that matches a destructive pattern (`rm`, `git clean`, `git reset --hard`, `Remove-Item` and similar). The prompt and the deletion both carry the flag.

**Blocked by:** 28.

**Status:** done

- [x] A freeze prompt followed by `rm` flags the prompt and the deletion with one finding
- [x] A deletion with no freeze, or a freeze followed only by reads, produces no finding
- [x] Harness-injected prompts never count as a freeze
- [x] Seam C trigger and clean fixtures

**Technical notes:** Prompts are stored truncated at 200 characters, so a freeze phrase past that limit is invisible. Record it as a known false negative. Raising the cap is a capture change and needs Kevin. Ticket 22 already identifies harness prompts. The scanner must reach the same answer without importing the service, so that knowledge moves to a place both can read.

**Implementation notes (7 Nov 2026):**
- New fact `text`: a real user prompt's text, and null for a harness-injected prompt. The harness check moved from `TurnBuilder` into `schema/EventFacts`, so the turn grouping and the scanner give the same answer. `TimelineEntry.isHarnessPrompt` carries it to the turn grouping.
- The last step says `each: true`. A freeze stays in force, so every later deletion is its own finding, each naming the freeze prompt and the deletion. The loader rejects `each` on any other step.
- Known false negative: prompts are stored truncated at 200 characters, so a freeze phrase past that point is not seen. Raising the cap is a capture change and needs Kevin.
- The window is one day (`seconds: 86400`), long enough for a working session.
- Deletion checks (harness prompt counted as a freeze, `each` ignored, harness prompts shown in turns) each fail the suite.

**Review fix (10 Nov 2026):** A freeze is now a direct order, not a word that appears somewhere in the prompt. Before, "never mind, just delete it", "fix the freeze bug" and "make the field read-only" each counted as a freeze. Now it takes don't / do not / never, then up to three words with no punctuation, then delete, remove, rm, erase or wipe. "Never mind" and "don't forget" are excluded. "Code freeze" counts, and so does read-only given as an instruction ("read-only mode / please / from here / from now", "stay / remain read-only"). The clean fixture carries the three ordinary phrases, each followed by a deletion. A seam C table test checks nine freeze phrases and seven ordinary ones, one session each. Removing each part of the pattern, or putting back the bare `freeze`, the bare `read-only` or the old 40-character span, fails the suite. The recorded exit run's freeze ("Freeze: don't delete anything in this folder.") still matches.
