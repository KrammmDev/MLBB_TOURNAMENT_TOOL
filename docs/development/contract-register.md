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
