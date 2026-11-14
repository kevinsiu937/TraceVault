# 61 — Files written by the shell

**What to build:**
- Each parsed command lists the files it writes: `>`, `>>` and `&>` targets (not `/dev/null`, not `>&`), `tee`, `curl -o`, `wget -O`, and the destination of `cp`, `mv` and `install`.
- New operators:
  - `writes` tests those files against globs;
  - `runs` accepts a bound command line and uses its written files;
  - `runs_own_write` finds a write and a later run in the same line.
- `runs-written-file` v2 starts on an edit-tool write or on a shell write.
- A new rule, `runs-own-write`, covers the one-command case, which a two-step rule cannot see.

**Blocked by:** 53, 60.

**Status:** done

- [x] `curl -o tool.sh` then `sh tool.sh`, a here-document `cat > gen.py` then `python3 gen.py`, `echo … > a.sh` after a `cd` then `bash tools/a.sh`, and an edit then `bash < setup.sh` raise `runs-written-file` (Seam C trigger)
- [x] `echo … > t.sh && bash t.sh`, `curl -o i.sh … && sh i.sh`, a here-document then `python3`, and `tee` then `./run.sh` raise `runs-own-write` (Seam C trigger)
- [x] Writing one file and running another, logging a run's output, running from another folder, running before writing, and writing a note stay quiet (Seam C clean)
- [x] Written files and `<` input in the parser's unit table
- [x] `writes` and `runs_own_write` reject bad arguments with the file and field named
- [x] Typecheck, build and the full suite pass
