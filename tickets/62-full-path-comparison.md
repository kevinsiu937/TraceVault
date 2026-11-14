# 62 — Compare the full path of the file that ran

**What to build:**
- `runs` resolves a relative script path against the session's project folder and any `cd` earlier in the same line, and compares full paths.
- The workflow scanner gives every match the binding `session.project`, from the session's start.
- When a full path cannot be worked out, `runs_by_name` compares by name, and `runs-written-file` labels the match "probable, by file name".

**Blocked by:** 61.

**Status:** done

- [x] `sub/task.sh` written and `bash task.sh` run from the project folder stays quiet (Seam C clean); it matched by name before
- [x] With the project folder unknown, every trigger pair still matches, labelled "probable, by file name" (Seam C)
- [x] A full-path match is labelled "run" (Seam C)
- [x] Making `runs` compare by name fails the clean fixture
- [x] `docs/probes/scripts/bash-cwd-probe.sh` written; it passes the probe-safety seam
- [x] Kevin ran the probe and recorded whether every bash call starts in the project folder (15 Nov 2026, OpenCode 1.18.32, deepseek-flash: yes. `pwd`, then `cd sub && pwd`, then `pwd` printed the workspace, workspace/sub, the workspace; `shell.env` reported the workspace as `cwd` for all three calls, so a `cd` lasts only for its own call)

**Open question:** does OpenCode's bash tool start every call in the project folder, even after an earlier call ran `cd`? Full paths assume it does. If it does not, a real run is missed, never invented. Run:
`TRACEVAULT_PROBE_MODEL=deepseek/deepseek-flash sh docs/probes/scripts/bash-cwd-probe.sh /tmp/tv-cwd`
