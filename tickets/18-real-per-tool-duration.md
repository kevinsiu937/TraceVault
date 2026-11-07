# 18 — Real per-tool duration (data, not idle)

**What to build:** The store currently records event start times; the waterfall must fall back to "time until the next event", which mixes agent thinking time into tool duration and makes wide bars mean "idle", not "long-running tool". Capture the actual duration of each tool execution at the hook and store it on the event, so the waterfall and detail panel can show honest tool durations.

**Blocked by:** 02 — Every tool type, with outcomes.

**Status:** done

- [x] The hook payload's duration (or end time) is normalised onto the event envelope
- [x] The store persists it and the timeline/detail surfaces it as `duration`
- [x] The waterfall consumes stored duration instead of time-to-next-event (falls back gracefully when absent, e.g. imported history)
- [x] A seam-B test: a fixture payload with a known duration yields that duration on the stored event
- [x] Imported legacy events without duration remain valid — nothing breaks for pre-existing rows

**Technical notes (from prototype):** Finding from applying real data: `003-real-session` bars were 10–17s wide because events sit seconds apart; the reader could not tell a 17s tool call from a 17s pause. Duration must come from the capture layer, not be inferred. This is a schema + capture + read change — vertical slice, not just a column.

**Implementation note:** the live source is plugin-measured elapsed time between `tool.execute.before` and `tool.execute.after`, not a payload field. The waterfall sizes each bar from the stored duration and falls back to time-to-next-event when it is absent; the waterfall seam test pins both cases in one session.
