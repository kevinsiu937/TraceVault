# ADR 0004: Rule files are YAML, parsed by `yaml`

- **Status:** accepted (Phase 2 spec, approved 7 November 2026)
- **Date:** 7 November 2026
- **Deciders:** Kevin Siu, Hui Siu Hin

## Context

The workflow scanner's rules are hand-written data that a reviewer must be able to read and edit. Each rule needs comments that explain its patterns, and lists of paths and command patterns. The roadmap names YAML. Until now TraceVault had no runtime dependencies at all, only dev dependencies.

## Decision

Rules live as one YAML file per rule under `rules/`. They are parsed by the `yaml` package, pinned to exactly `2.9.1`.

- **Why YAML.** JSON has no comments, and every rule needs them. A rule written as TypeScript would make each rule edit a code change and would let a rule run code.
- **Why this package.**
  - It has no dependencies of its own and ships its own types.
  - It follows YAML 1.2, so `yes` and `no` stay strings and do not turn into booleans.
  - It is ISC licensed.
  - Version 2.9.1 was released on 11 September 2026, more than eight weeks before adoption.
- **Strict parsing.** The loader parses with `strict: true` and `uniqueKeys: true`. It then checks the document against the typed rule shape and rejects unknown keys. A typo is a load error that names the file and field, never a silently ignored condition.

## Consequences

- **First runtime dependency.** `package.json` gains its first entry under `dependencies`. Updates are deliberate, exact-version bumps.
- **Only the loader touches YAML.** The parser is used by `RuleYaml` alone (`RuleLoader` until Phase 3, when the static rule loader joined it). Everything after loading works on typed rule objects, so the parser could be replaced in one file.
- **Plugin runtime unchecked.** Opt-in blocking (ticket 34) loads rules inside OpenCode's plugin runtime. Ticket 34 must check that this package loads there before relying on it.

## Alternatives rejected

- **JSON rule files.** No dependency, but no comments, and the roadmap would need amending.
- **A hand-written YAML subset parser.** No dependency, but it is a parser to maintain and test, with edge cases a reviewer cannot predict.
