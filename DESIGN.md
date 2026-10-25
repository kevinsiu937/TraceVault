# TraceVault dashboard design

The dashboard is server-rendered HTML with inline CSS and one small inline script. No client build step, no external assets, no framework. This file is the visual contract for `src/dashboard/`.

## 0. Research log

- `jaegertracing/jaeger-ui` — tree rail with per-depth guides, dot for leaf, count box for parent, cut line at the last sibling (`SpanTreeOffset.css`, `SpanBarRow.css`).
- `SigNoz/signoz` — timing as geometry; outcome attaches to the marker, not the bar (`TraceWaterfallStates/Success`).
- `getsentry/sentry` — one row component per event kind; kind is a row type, not a boolean flag (`traceSpanRow.tsx`).
- `langfuse/langfuse` — outcome badges are tinted background + saturated text; kind is a separate axis from outcome.
- URL filters: GitHub/Sentry/Langfuse use named facet params plus a free-text `q`; chips are links carrying the current query; empty states keep the filter bar visible.

## 1. Tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f5f5f7` | `#000` | Page |
| `--panel` | `#fff` | `#1c1c1e` | Cards, rows |
| `--panel-2` | `#f8f8fa` | `#242426` | Open detail |
| `--text` / `--muted` | `#1d1d1f` / `#6e6e73` | `#f5f5f7` / `#98989d` | Text |
| `--line` | 8% black | 12% white | Hairlines, rail |
| `--ok` / `--err` / `--warn` | green / red / amber | brighter variants | Outcome |
| `--kind-hook` | `#0071e3` | `#0a84ff` | Shell |
| `--kind-document` | `#8944ab` | `#bf5af2` | File |
| `--kind-mcp` | `#0b7285` | `#40c8e0` | MCP |
| `--kind-skill` | `#c2410c` | `#ff9f0a` | Skill |
| `--kind-session` | `#8e8e93` | `#8e8e93` | Boundaries |
| `--kind-gap` | `#a16207` | `#ffd60a` | Capture gap |

Type: system UI stack for prose; `ui-monospace` for commands, paths, times, ids. Radii 18px cards, 999px pills. Shadow is one soft elevation only.

## 2. Timeline anatomy

- A vertical rail runs through the marker column; one 12px marker per event, coloured by `data-kind`.
- Each row: time (left), marker, kind label + target, outcome pill + chevron (right).
- `document.access` paths show the last two segments in the row; the expanded detail keeps the full stored event.
- Outcome is never colour-only: a pill carries the word; `error` adds a solid red marker ring, `denied` a dashed amber ring.
- Expansion is native `<details>/<summary>` — no JS, keyboard accessible, persists while the page is open.
- Expanded detail is the stored event JSON in a scrollable `<pre>`, so the reader can inspect hashes, ids and raw payload without a second screen.

## 3. Filters

- URL is the only state: `?kind=document.access&outcome=error&operation=write&q=vault`.
- Kind, outcome and saved-view chips are links. The active chip uses `aria-current="true"` and an accent tint. A `Clear` link removes all filters.
- Session page: saved views filter the current session. Activity page: the same saved views filter across sessions.
- The search form is a GET form; hidden inputs carry the active facets so a text search does not drop them.
- Legend chips show the count of each kind present in the session; counts are computed from the full session timeline, not the filtered subset.
- Filtering happens in SQL (`SqliteEventStore.listMatching`), never by hiding rows in the browser.
- Empty results keep the filter bar and say `No events match this filter` with a clear link.

## 4. Activity view

`/activity` groups matching rows by session, newest session first, each group headed by the session title, id, agent and matching count. Rows inside a group stay in execution order.

## 5. Responsive and accessibility

- At ≤640px the time column drops, the rail moves to the left edge, and the target/outcome remain visible. The filter chips wrap.
- Summary text uses `role="status"`; chips are real links; `<summary>` is focusable; focus rings are visible.
- `prefers-reduced-motion` turns off chip/chevron transitions.
- No external fonts, images or scripts.

## 6. Accepted debt

- The session ID is the page title; session title is only shown in the list and activity groups.
- The activity view does not stream live; only a session page does.
- `1000`-event layout is proven by a seam test, not by a real browser performance profile.
