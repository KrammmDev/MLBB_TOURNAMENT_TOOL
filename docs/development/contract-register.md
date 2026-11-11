# Contract register
Keep this as the authoritative index of shared implementation contracts. Before work, record current fields/event shapes from actual code, then label proposals separately. Do not duplicate competing specifications inside skills.

| Contract | Owner | Required decisions |
| --- | --- | --- |
| State/API/WS | broadcast-core | authorities, schema versions, commands, revisions, snapshot and durable acknowledgement |
| Competition identity | competition-systems | team/side identity, series/game generation, results and reset semantics |
| OCR observations | ocr-capture + broadcast-core | capturedAt/sequence, calibration revision, field parsing, freshness, rejection and manual lock |
| Theme manifest | broadcast-design-system | theme revision, compatible outputs, assets, activation and rollback |
| Operator cues | production-workflows | edit/preview/publish, acknowledgement, interruption and recovery |
| Adapter lifecycle | broadcast-integrations | host topology, ready/error, reconnect, source visibility and worker supervision |
| Acceptance evidence | production-validation | fixtures, measured budgets, target hardware and unverified checks |

Existing POST /api/matchdata replaces the complete match document. Proposed OCR ingestion must avoid partial-document replacement and lost updates. Do not invent endpoint names as existing APIs; update this register alongside actual implementation.


## Implemented: match-state foundation (phase 1)

`lib/match-store.js` owns serialized match writes and `lib/match-routes.js` owns the HTTP contract. The server awaits initial cache/flag/hero loading before listening. An unreadable or structurally invalid match file stops startup with a visible error instead of serving defaults that a panel could overwrite onto saved data. Back up and repair/restore that file before restarting; the original file is retained.

- `GET /api/matchdata` keeps the existing bare match-document body. `ETag` and `X-Match-Revision` expose an opaque, process-epoch revision; `Cache-Control: no-store` prevents stale polling responses.
- `PATCH /api/matchdata` accepts `{ changes, guards? }`. A change is `{ path: string[], previous: { exists: boolean, value?: JSON }, value: JSON }`. A guard is `{ path, previous }` and checks context without changing it. Paths are own-property paths; prototype keys, invalid array indices and overlapping changes are rejected. Deletion is deliberately unsupported. Batches contain 1–256 changes and at most 64 guards.
- Comparison and application happen inside the same write queue against the latest committed document. Unrelated leaf edits can both succeed. Any mismatched previous value or context guard rejects the entire batch with `409` and `conflicts` paths. Invalid data receives `400`; storage failure receives `503`.
- Postgame guards include game number/match info, team names and player names/heroes. This prevents edits crossing those context changes. These are compatibility guards, not a replacement for future stable game/team IDs; an identical reset with identical context cannot be detected yet.
- A successful write atomically replaces the JSON file before updating cache, emitting events or acknowledging success. This avoids partial-file visibility; it does not claim guaranteed survival of power loss. The document stays in its existing JSON format.
- Success body is `{ message, data, revision }`. `matchdata_update` still carries the bare document in `data`; the legacy `update` event still carries `{ matchdata }`. Both additionally carry the revision. No-op saves do not generate extra events or writes.
- `POST /api/matchdata` remains a complete-document compatibility endpoint, now serialized and persisted before acknowledgement. A complete document has blue/red teams with five player objects each. Other JSON fields are preserved. New callers should use PATCH. Optional exact `If-Match` works for POST/PATCH; stale revisions receive `409`. Clients must reread after a server restart.

### First migrated consumer
`public/postgamecontrol.html` uses the explicit `MatchState`/`MatchDataClient` scripts. It sends field diffs, serializes local saves, protects focused inputs, buffers live snapshots during edits, reconnects with a fresh read, and polls every five seconds as recovery. A conflict/failure blocks dependent saves and retains local edits visibly until the operator chooses to discard them via Reload latest match. There is no silent retry or fetch/localStorage monkey patch.

### Remaining migration limits
Other controllers still make unconditional whole-document POST requests and can overwrite newer unrelated state. This phase does not claim that concurrency is solved across all legacy panels. Draft, schedule, theme, tournament, MVP and archive persistence paths still need independent migration. Result counting and competition rules are unchanged. Shared overlay/theme rendering and three complete themes remain subsequent work. OCR remains on hold.

## Implemented: control-panel match migration (phase 2)

Both `control.html` and `controlban6.html` now load `control-match.js` (one guarded match-edit session) and `control-panel-match.js` (shared operator controls). Team/player names, lanes, coaches/full names where present, logos, series scores, format, winner, match labels, title and the existing `turtles` counter write through field patches. The shared nickname script and hero/ban match mirrors no longer issue full-document match POSTs. This supersedes the main-control limitation described under phase 1; the compatibility POST endpoint remains available to unmigrated/external callers.

- Each change compares the observed previous field values and match/lineup guards inside the server queue. Input debounce keys are independent per element. Debounced jobs are staged before explicit reset/swap actions, so delayed input does not undo a later operator command.
- The edit session serializes writes and blocks dependent changes after a conflict/failure. Focused or unsaved inputs hold incoming match snapshots. Reload requires explicit confirmation when discarding local work; initial load failures can also recover through that control.
- Team-name input updates `teamname` and its existing `name` alias in the same patch. Team nickname switching carries names, full names, coaches, logos, scores and player names/lanes together; it does not move in-game statistics or draft hero assignments. Logo and player-name/lane swaps have their own targeted patches.
- Score arithmetic normalizes loaded string scores to numbers. Format plus score reset is one batch. The normal panel's existing +Win hero-stat recording occurs only after a successful score save; the 6-ban panel retains its prior behavior without that stats call. This is not game-result idempotency or a result-correction engine.
- The main `turtles` field remains distinct from postgame `turtle`. No counter-schema migration is implied. Score reset does not pretend to clear persisted objective counters.
- Match updates use the shared match socket and recovery poll instead of the panels' former one-second match GET loops. Draft transport/timer logic remains separate. Existing overlay URLs and match API/event contracts remain unchanged.
- A hero/ban mirror patch must succeed before the local draft selection advances. A rejected mirror leaves the persisted draft unchanged and refreshes its UI. **The match mirror and draft JSON save are still separate operations**: draft API/persistence failures and cross-panel draft concurrency require a later domain migration. No cross-file transaction or new draft rules are claimed.

See `control-migration.md` for test scope and operator checks. OCR and graphics/theme redesign remain on hold for this increment.
