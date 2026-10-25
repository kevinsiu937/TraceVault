# File Structure

The rule behind the layout: **open one file, see everything you need.** If changing the display forces you to read the store, the boundary is wrong.

**Tests are not per-class.** There are two seams, described in `docs/specs/phase-1-backbone.md`: an HTTP request rendered against a temporary database, and a recorded hook payload turned into stored events. The `*.test.ts` names in the tree below are the pre-seam plan and are superseded — no test file is required per class.

## Layout (Phase 1)

```
src/
  schema/                        # shared vocabulary — imported by every stage, imports nothing
    Event.ts                     #   the Event type (single envelope)
    EventType.ts                 #   the union of legal event types
    EventFactory.ts              #   builds a valid Event from partial input, assigns id + timestamp
    EventFactory.test.ts
    EventValidator.ts            #   rejects an Event that breaks the envelope contract
    EventValidator.test.ts

  capture/                       # how events arrive — knows nothing about the UI
    CapturePort.ts               #   interface: receive(payload) → Event[]
    PluginHookCapture.ts         #   implements CapturePort for the OpenCode hook payloads
    PluginHookCapture.test.ts
    HookPayloadParser.ts         #   one payload → Event[] (one per tool call phase)
    HookPayloadParser.test.ts
    CaptureRegistry.ts           #   fans an incoming payload to the registered CapturePorts
    CaptureRegistry.test.ts

  store/                         # persistence — knows nothing about HTTP
    EventStorePort.ts            #   interface: append, readBySession, listSessions
    SqliteEventStore.ts          #   implements EventStorePort
    SqliteEventStore.test.ts
    HashChain.ts                 #   prev-hash chaining + verification
    HashChain.test.ts
    CanonicalJson.ts             #   stable serialisation so hashes are reproducible
    CanonicalJson.test.ts

  service/                       # the façade — the ONLY thing the UI may call
    InvestigationServicePort.ts  #   interface: listSessions, getTimeline
    InvestigationService.ts      #   implements it on top of EventStorePort
    InvestigationService.test.ts
    SessionSummary.ts            #   value object: id, start, end, event count, agent
    SessionSummary.test.ts
    TimelineBuilder.ts           #   merges events into one ordered, gap-marked timeline
    TimelineBuilder.test.ts

  dashboard/                     # presentation — imports service/ and schema/ only
    DashboardServer.ts           #   http server, binds 127.0.0.1
    DashboardServer.test.ts
    SessionListView.ts           #   renders the session list
    SessionListView.test.ts
    TimelineView.ts              #   renders one session's timeline
    TimelineView.test.ts
    routes/
      SessionsRoute.ts
      SessionsRoute.test.ts
      TimelineRoute.ts
      TimelineRoute.test.ts

  plugin/                        # the code that ships INTO the agent
    TraceVaultPlugin.ts          #   registers hooks, forwards payloads to the local service
    TraceVaultPlugin.test.ts
    PluginConfig.ts              #   endpoint + options, read from env/config
    PluginConfig.test.ts

  cli/                           # composition root — the only place implementation is chosen
    index.ts                     #   argv → command (already exists)
    InitCommand.ts               #   install: plugin registration + config, reversible
    InitCommand.test.ts
    RunCommand.ts                #   wire store → service → dashboard, start server
    RunCommand.test.ts

rules/                           # YAML rule files (Phase 2+, empty in Phase 1)
tests/
  fixtures/                      # sample hook payloads, sample sessions
  integration/                   # multi-component runs, marked separately
```

## The five rules that keep it that way

1. **One class per file**, name matches filename, test sits beside it (`Foo.ts` + `Foo.test.ts`).
2. **Boundaries are `*Port.ts` interfaces.** `capture` and `dashboard` never import the store's concrete class; they import `EventStorePort` / `InvestigationServicePort`.
3. **Only `src/cli/` picks implementations.** One place to see how the system is assembled.
4. **Imports point one way:** `cli → dashboard → service → store`, and `cli → plugin → capture → schema`. A file importing "upward" is a bug, not a style choice.
5. **No barrel files** (`index.ts` re-exporting a folder). They hide the dependency graph and make "which file do I change?" unanswerable — the exact problem this layout exists to prevent.

## Adding a feature — the checklist

1. Which stage owns it? If two stages, the boundary needs a new port method.
2. New class → new file → new `*.test.ts` next to it.
3. Does the dashboard need something new? Add it to `InvestigationServicePort` first, implement, test, then render.
4. Does anything import upward? Restructure before writing the test — do not "fix it later".
