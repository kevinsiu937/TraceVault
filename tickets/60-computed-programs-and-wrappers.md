# 60 — Computed programs and wrappers that take a value

**What to build:**
- A command whose program's name is computed (`$RUN x`, `$(which sh) x`, a backtick) counts as opaque: the entry `$` in the `opaque-execution` list.
- The parser skips the values wrapper flags take (`sudo -u root`, `env -u X`, `nice -n 10`, `timeout -s KILL 30`, `time -o f`), so `sudo -u root rm -rf x` reads as `rm`.
- Here-document bodies are no longer read as commands, and code fed to an interpreter through a here-document or a here-string counts as fed by the line.

**Blocked by:** 53. Spec: `docs/spec/evasion-before-phase-5.md`.

**Status:** done

- [x] `$RUN build.sh`, `sudo -u root bash -c …`, `timeout -s KILL 30 node -e …` and `python3 <<'EOF' … EOF` raise `opaque-execution` (Seam C trigger)
- [x] A here-document that only writes a note, `sudo -u root ls` and `python3 $SCRIPT` stay quiet (Seam C clean)
- [x] Parser rows for wrappers, here-documents, here-strings and computed names (unit table)
- [x] Breaking here-document skipping fails the unit table and the clean fixture
- [x] Typecheck, build and the full suite pass
