# 06 ??Append-only integrity

**What to build:** The record resists quiet rewriting. Every stored entry carries the hash of the previous entry, so a modified or deleted row is detectable rather than invisible. A verification action reports the first inconsistency it finds, by session and position.

This is a property of the store, not a headline feature: it exists so the reader can trust the timeline, and it is demonstrated by showing tampering being caught.

**Blocked by:** 01 ??Walking skeleton.

**Status:** ready-for-agent

- [x] Each stored event references the hash of its predecessor
- [x] Modifying any stored event makes verification fail and names the first bad position
- [x] Deleting a middle event makes verification fail
- [x] A clean store verifies successfully
- [x] Verification is covered by a seam-B test that tampers with the temporary database directly
