# 70 — The database lives outside the project by default

**What to build:** `tracevault run`, `import` and `report` without `--db` use `data/tracevault.db` under the current folder. Run inside a project, that puts recorded commands and prompts where one `git add .` commits them; run from another folder, the history looks empty. The default becomes one fixed place in the user's state folder, beside the plugin's gap state. `--db` still overrides it.

**Blocked by:** None (can start immediately).

**Status:** done

- [x] `run`, `import` and `report` without `--db` use the same file under the user's state folder, whatever the current folder (through the CLI)
- [x] Nothing is created in the current folder
- [x] `--db <path>` still decides
- [x] The usage text and `docs/DEMO.md` name the default
- [x] Typecheck, build and the full suite pass

**Technical notes:**
- The folder is the plugin's own state folder (`PluginConfig.stateDirectory()`): `%LOCALAPPDATA%\\tracevault` when that variable is set, otherwise `~/.local/state/tracevault`.
- A database a user already has at `data/tracevault.db` is not moved. They keep using it with `--db data/tracevault.db`, or move the file by hand.
- "Nothing is created in the current folder" holds because the default is an absolute path; the test checks the file appears in the state folder.
