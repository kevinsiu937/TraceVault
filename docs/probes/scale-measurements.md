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

## One read per session (ticket 78)

Recorded 16 Nov 2026 on the same machine, after the session page, the configuration page and the report moved to one call (`getSession`) that reads the session's events once. "Session view" is that call; it replaces the separate findings and configuration-findings rows.

| Events | Timeline | Session view | Findings | Session page | Page size | Report | Report size |
|---|---|---|---|---|---|---|---|
| 1,000 | 95 / 5 | 98 / 10 | 307 | 162 / 55 | 2.2 MB | 88 / 15 | 0.5 MB |
| 10,000 | 4,986 / 52 | 4,894 / 89 | 3,076 | 5,459 / 415 | 21.9 MB | 5,058 / 176 | 5.0 MB |
| 50,000 | 134,598 / 320 | 114,762 / 886 | 15,384 | 106,577 / 2,603 | 110 MB | 100,341 / 3,028 | 25 MB |

- **Warm:** the page and the report no longer read the session five or six times, or every session's events to find one summary. A repeat view of a 10,000-event page went from 563 to 415 ms, and the report from 329 to 176 ms.
- **Cold:** slower than on 13 Nov, and the timeline row, which ticket 78 did not change, grew by the same factor. Both pay for the first scan of the rules, which has more rules to run since tickets 60 to 66. This run did not separate that from load on the machine, so the cause is the shared scan, not the single read. It is still quadratic in the session's length.

## Matches held once (ticket 82)

Recorded 16 Nov 2026 on the same machine. `RuleMatcher` now keeps partial matches that wait at the same step with the same bindings once, as one run, and closes the oldest of them first. Every rule keeps its findings and their event ids: the counts below match the ticket 78 run, and a Seam C test compares a 2,161-event session with what the old matcher raised.

| Events | Timeline | Session view | Findings | Session page | Page size | Report | Report size |
|---|---|---|---|---|---|---|---|
| 1,000 | 51 / 5 | 33 / 11 | 307 | 103 / 58 | 2.2 MB | 31 / 13 | 0.5 MB |
| 10,000 | 181 / 51 | 195 / 90 | 3,076 | 551 / 412 | 21.9 MB | 268 / 165 | 5.0 MB |
| 50,000 | 3,191 / 452 | 1,402 / 643 | 15,384 | 3,503 / 2,677 | 110 MB | 3,403 / 2,984 | 25 MB |

- **Cold:** the first view of a 10,000-event session went from 4,894 to 195 ms, and of a 50,000-event one from 114,762 to 1,402 ms. Ten times the events now cost about six times the time, and five times cost about seven.
- **What is left:** at 50,000 events the cold page and report are limited by building the rows and the HTML, close to their warm times. The cold timeline at 50,000 is one sample and includes the first read of the file.

The scan alone, without the store or the HTML (ms, same synthetic session):

| Events | Old matcher, rules of 12 Nov | Old matcher, today's rules | New matcher, today's rules |
|---|---|---|---|
| 1,000 | 36 | 78 | 13 |
| 4,000 | 306 | 968 | 41 |
| 8,000 | 957 | 3,276 | 74 |

**Why the ticket 78 cold times were slower than 13 Nov's.** It was the rule set, not the machine. Under the old matcher, today's rules scan the same session about 3.4 times slower than the rules of 12 Nov (`64cfb55`). Two rules account for it at 8,000 events:
- `runs-written-file` version 2: 1,605 ms, against 635 ms for version 1 on 13 Nov. Its first step now also matches shell writes.
- `exfiltration-chain` version 2: 1,177 ms, against 473 ms. Its egress step parses the command line.

The old matcher checked every open match against every event, so a dearer condition was paid once per open match. The new matcher checks it once per run.

## Timeline pages (ticket 83)

Recorded 16 Nov 2026 on the same machine, after ticket 82. The session page shows one page of 500 rows, the newest by default. The report is not paged.

| Events | Timeline | Session view | Session page | Page size | Report | Report size |
|---|---|---|---|---|---|---|
| 10,000 | 199 / 56 | 212 / 91 | 312 / 183 | 4.3 MB | 272 / 163 | 5.0 MB |
| 50,000 | 886 / 314 | 1,107 / 479 | 1,719 / 944 | 17.7 MB | 3,580 / 2,990 | 25 MB |

- **Page:** a repeat view of a 50,000-event page went from 2,677 to 944 ms, and its size from 110 to 17.7 MB.
- **What is left:** the findings panel, which describes the whole session. The synthetic session raises a finding about every three events. At 10,000 events, the panel is 2.5 MB of the 4.3 MB page, and the 500 rows are 0.9 MB. A real session raises far fewer.

## A new event while the page is open (ticket 69)

Recorded 15 Nov 2026 with `docs/probes/scripts/measure-live.mjs` on the same machine. It times one `POST /hook` into the synthetic session, three samples each, in milliseconds.

| Events | No page open | Page open, before | Page open, after |
|---|---|---|---|
| 1,000 | 6 to 25 | 85 to 103 | 11 to 23 |
| 4,000 | 2 to 10 | 1,444 to 1,696 | 28 to 29 |
| 10,000 | 2 to 7 | 6,347 to 8,406 | 63 to 73 |

- **Before:** the open page asks for the timeline on every event, the findings cache missed because the session had grown, and the whole session was scanned again before the plugin got its answer. The plugin waits 2 s, so past about 5,000 events it recorded a gap for an event that had been stored.
- **After:** `SessionFindings` continues a session's scan from where it stopped when the session only grew at its end. What is left grows in a straight line with the session: reading its events and building the rows.
- **Still slow:** the first view of a long session after the service starts, and any event that sorts before ones already scanned, scan the session from the start. The three session-window rules still grow with the square of its length there.

## Size

| Events | Bytes per event (body) | Configuration and tool lists | Database file | After VACUUM |
|---|---|---|---|---|
| 1,000 | 497 | 2.2 KB | 960 KB | 952 KB |
| 10,000 | 501 | 2.2 KB | 9.1 MB | 9.0 MB |
| 50,000 | 503 | 2.2 KB | 44.3 MB | 43.8 MB |

The database holds about 0.9 KB per event, counting the indexes and the hash columns. The configuration snapshot and the tool lists take 2.2 KB per session, a fixed cost that stays small even for a 100-event session. VACUUM recovers almost nothing, because events are only ever appended.

## What the numbers call for

- **The findings cache (ticket 57): yes, added.** The session page was over the one-second threshold at 10,000 events. A repeat view is now 0.56 s. The first view of a 10,000-event session is still about 3 s, and of a 50,000-event session about 54 s.
- **Not fixed by these tickets:** the page renders every row, so a 50,000-event page is 110 MB and takes 3.5 s even when cached. Paging the timeline would fix it. (Ticket 83 did; see above.)
- **Ticket 58, storing configurations and tool lists once: no.** They are 2.2 KB per session, under 1% of a 300-event session and less above that.
- **Ticket 59, automatic archive: not called for by these numbers alone.** At about 0.9 KB per event, a million recorded events is about 0.9 GB. Whether a real database reaches that depends on how much the agent is used, which this probe cannot measure. Two things also grow with the whole database, not one session: the session list, which scans every event on each load (a `shortcut:` comment in `InvestigationService.listSessions`), and the activity page. Measure them on a real database before building 59.
- **What would fix the cold first view:** incremental matching, or matching the three session-window rules against an index of first-step events instead of every pair. This is not part of these tickets. (Ticket 82 did it by holding interchangeable matches once; see above.)
