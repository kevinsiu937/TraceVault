# 42 — Tool poisoning: hidden instructions and invisible text

**What to build:** Two rules over MCP and plugin tool descriptions, including every description inside a tool's parameter schema. `tool-hidden-instructions` flags instruction patterns aimed at the model, one label each: telling it to ignore earlier instructions, to keep something from the user, to read a secret file or pass its contents as an argument, or to call another tool first, and `<IMPORTANT>`-style tags. `tool-invisible-text` flags zero-width, bidirectional-control and Unicode tag characters. The finding names the tool, its server and the labels that matched.

**Blocked by:** 36, 41.

**Status:** ready-for-agent

- [ ] The patterns live in a named list, one labelled entry each, so a new pattern is a data edit
- [ ] The fake MCP server's poisoned descriptions raise the expected labels, including one instruction hidden only in a parameter description and one written in Unicode tag characters
- [ ] Every built-in OpenCode 1.18.32 tool description, as recorded in ticket 41, produces no finding. Built-in tools are excluded by source, and the clean fixture proves that the exclusion is needed
- [ ] A plain, honest MCP tool description produces no finding
- [ ] Source: OWASP MCP03:2025 Tool Poisoning, checked against the published list
- [ ] Seam C trigger and clean fixtures
- [ ] `npm run build`, `npm run typecheck` and `npm test` all pass

**Technical notes:** Pattern matching on text is easy to evade, as Phase 2 found for shell egress. The finding says "possible" and names the pattern that matched, and the spec's Known Blind Spots says so.
