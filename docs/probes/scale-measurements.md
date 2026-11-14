# Scale measurements (ticket 56)

Recorded 13 Nov 2026 with `docs/probes/scripts/measure-scale.mjs` against `dist/`.

- **Machine:** Apple M1, 8 cores, 8 GiB.
- **Software:** macOS (darwin arm64), Node v24.22.2.
- **Rules:** the 10 workflow rules and 8 configuration rules in the repository at the time.
- **Session:** one synthetic session per size, built from the Phase 2 exit run's 11 recorded actions repeated with fresh ids and times. It has a configuration snapshot and the Phase 3 exit run's tool lists up front.

Times are milliseconds, given as **cold / warm**:
- **Cold:** the first call on a freshly opened service, so nothing is cached. This is what a person sees the first time they open a session.
- **Warm:** the median of the following calls on the same service.

## Before the findings cache

The run before the cache was added (median of 5, every call scanned):

| Events | Timeline | Findings | Config findings | Session page | Report |
|---|---|---|---|---|---|
| 1,000 | 42 | 37 | 4 | 129 | 97 |
| 10,000 | 2,361 | 2,366 | 32 | 5,319 | 5,013 |

Ten times the events cost 64 times the time. The page and the report each scanned the session two or three times per request: once for the row flags, once for the findings, and once more to compare rule sets.

## Where the time goes

Each workflow rule was timed alone on the same synthetic session (ms, findings):

| Events | destructive-action | exfiltration-chain | runs-written-file | every other rule |
|---|---|---|---|---|
| 1,000 | 16 | 20 | 16 | ≤ 2 each |
| 2,000 | 29 | 46 | 41 | ≤ 3 each |
| 4,000 | 106 | 198 | 159 | ≤ 7 each |
| 8,000 | 414 | 473 | 635 | ≤ 12 each |

**What limits it.** These three rules have a first step that matches often, and a second step that may come anywhere later in the session (`window: session`). The matcher pairs every first-step match with every later event, so the cost grows with the square of the session.
- The synthetic session makes this worse than a real one. It repeats the exit run every 11 events, so it holds a "don't delete" prompt, a secret read and a file write about every 11 actions.
- In a real session, secret reads and freeze prompts are rarer.
- File writes are common, though, so `runs-written-file` (ticket 53) is the rule most likely to show this in practice.

## After the findings cache

`SessionFindings` keeps the findings of the last 16 sessions it scanned. The key is the session, its event count and its last event, so a new event is a cache miss. Each rule set, today's or a stored older one, has its own cache.

| Events | Timeline | Findings | Config findings | Session page | Page size | Report | Report size |
|---|---|---|---|---|---|---|---|
| 1,000 | 81 / 6 | 50 / 8 | 14 / 6 | 438 / 112 | 2.2 MB | 95 / 32 | 0.5 MB |
| 10,000 | 2,541 / 102 | 3,173 / 31 | 32 / 31 | 3,005 / 563 | 21.9 MB | 2,652 / 329 | 5.0 MB |
| 50,000 | 48,738 / 447 | 48,527 / 306 | 274 / 182 | 54,121 / 3,520 | 110 MB | 53,361 / 3,781 | 25 MB |

- **Cold:** one scan per request instead of two or three, so roughly half the time. It is still quadratic.
- **Warm:** does not scan at all. What is left is building the timeline and the HTML: the 10,000-event page is 22 MB of HTML.
- **Config findings:** stay small. The static rules check one configuration, not the events.
- **50,000 events:** the warm figures are one sample, not a median. Cold scans fit the square of the length: five times the events cost about 15 to 19 times the time. A warm page at this size is limited by its 110 MB of HTML, since the page renders every row of the session.

## Size

| Events | Bytes per event (body) | Configuration and tool lists | Database file | After VACUUM |
|---|---|---|---|---|
| 1,000 | 497 | 2.2 KB | 960 KB | 952 KB |
| 10,000 | 501 | 2.2 KB | 9.1 MB | 9.0 MB |
| 50,000 | 503 | 2.2 KB | 44.3 MB | 43.8 MB |

The database holds about 0.9 KB per event, counting the indexes and the hash columns. The configuration snapshot and the tool lists take 2.2 KB per session, a fixed cost that stays small even for a 100-event session. VACUUM recovers almost nothing, because events are only ever appended.

## What the numbers call for

- **The findings cache (ticket 57): yes, added.** The session page was over the one-second threshold at 10,000 events. A repeat view is now 0.56 s. The first view of a 10,000-event session is still about 3 s, and of a 50,000-event session about 54 s.
- **Not fixed by these tickets:** the page renders every row, so a 50,000-event page is 110 MB and takes 3.5 s even when cached. Paging the timeline would fix it.
- **Ticket 58, storing configurations and tool lists once: no.** They are 2.2 KB per session, under 1% of a 300-event session and less above that.
- **Ticket 59, automatic archive: not called for by these numbers alone.** At about 0.9 KB per event, a million recorded events is about 0.9 GB. Whether a real database reaches that depends on how much the agent is used, which this probe cannot measure. Two things also grow with the whole database, not one session: the session list, which scans every event on each load (a `shortcut:` comment in `InvestigationService.listSessions`), and the activity page. Measure them on a real database before building 59.
- **What would fix the cold first view:** incremental matching, or matching the three session-window rules against an index of first-step events instead of every pair. This is not part of these tickets.
