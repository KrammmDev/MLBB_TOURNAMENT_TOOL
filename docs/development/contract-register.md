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

## Implemented: roster theme contract (phase 3)

- Catalog: `GET /api/roster-themes` returns schemaVersion 1, rendererVersion 1, canvas 1920×1080 and three presets with `outputs: ["roster"]`. IDs are `classic`, `arena`, `studio`. Art direction/layout changes belong in CSS; match binding stays in the single renderer.
- Selection: `GET /api/roster-theme` returns `{ data: { schemaVersion: 1, themeId, previousThemeId }, revision }` with no-store. `PUT /api/roster-theme` accepts `{ themeId }` plus an exact `If-Match` revision. Missing revision is 428, stale revision 409, unknown ID 400, persistence failure 503. A no-op does not write or broadcast. Revisions are opaque and change after restart.
- Successful persistence in ignored `runtime/roster-theme.json` precedes `roster_theme_update` with the same snapshot shape. Previous selection updates only on an actual change. Choosing that previous ID uses the same guarded PUT, not an unguarded rollback endpoint.
- The shared match client's optional third subscribe argument `{ onMessage }` lets the roster consume theme and allowlisted branding events on its existing match socket. Existing two-argument subscribers retain their behavior.
- `/broadcast-overlay.html` follows saved settings; `?theme=<id>` pins a preview. The two legacy URLs remain fixed to their corresponding presets and use the same model/renderer. Match data, slide pair and countdown are independent of style selection. New-source bootstrap uses its initial loaded style as fallback; theme failure is retained as a diagnostic attribute/event rather than a broadcast error banner.
- CSS activation is staged and latest-intent wins. It is not a global source-acknowledgement protocol. Disconnected sources reconcile on reconnect/periodic read; failed styles retain the previous loaded appearance. The operator UI reports saved selection, not verified on-air state.

Coverage and recovery instructions: `roster-themes.md`. All other output types and legacy `/api/theme` remain outside this roster contract.

## Implemented: shared draft display and expanded theme coverage (phase 4)

The display-only format/model in `draft-model.js` mirrors existing controller array order. Normal has 18 display phases, 6-ban has 14, each ending with Adjustment. Explicit output format is `normal` or `six`; it is never inferred from current picks or theme ID. The renderer does not write match/draft state or advance the competition.

Typed `draftdata_update` carries a full draft snapshot. Generic `update.data.draftdata` is a clock tick with valid integer seconds 0–600 and boolean timer_running. The server copies only those clock fields into its current draft cache; phase/hero fields in a tick are ignored. This adds no draft-file write and does not promise clock durability through server restart. Full draft persistence, concurrency and authority remain the existing controller/API contract.

Theme catalog coverage expands to `roster` and `draft`; draft styles use the same preset IDs/selection. `/api/broadcast-themes` and GET/PUT `/api/broadcast-theme` alias the existing roster routes/store and retain the same If-Match requirements. The legacy event topic remains `roster_theme_update`. Client readiness now also emits `broadcast-theme-ready/error` with id, output and optional format; roster-only readiness aliases remain. Operator preview validates output/format before enabling activation.

`/draft-display.html` follows the shared selection; `format=six` chooses the 6-ban display and `theme=<id>` pins a preview. Primary legacy draft URLs retain original geometry and share the renderer. New output canvas is 1920×1080 with a transparent bottom strip. Other graphic types remain outside this selection contract.

Current product constraint: no authored decorative game/league branding, slogans, watermarks or placeholder titles on broadcast scenes. Functional state and actual operator data remain. Automatic roster defaults/edge text were removed. See `draft-display.md` for behavior, audio options and remaining limits.

## Studio sponsor playlist

`/api/broadcast-sponsors` owns a revision-guarded playlist independent of match, draft and theme selection. Raster uploads use `/api/broadcast-sponsors/logos`; committed settings emit `broadcast_sponsors_update`. All three new draft themes render the shared sponsor playlist in their own slot (Arena footer; Classic/Studio center). Blank/disabled playlists introduce no placeholder or league branding. Runtime data and images live under ignored `runtime/`. See `broadcast-sponsors.md` for lifecycle, operator behavior and limits.

## Broadcast color palettes
`/api/broadcast-colors` owns independent runtime palettes for the three roster/draft theme scopes. GET returns a revision; PUT requires If-Match and validates six allowlisted HEX colors. Atomic persistence precedes `broadcast_colors_update`; no competition or theme-selection state is written. See broadcast-colors.md.

## Themed scoreboard output
The theme catalog now declares `scoreboard` coverage and per-theme scoreboardStyles. `/scoreboard-display.html` uses the existing match API/socket, shared staged CSS client and saved broadcast selection. It uses an independent scoreboard palette scope. Legacy scoreboard/OCR pages remain unchanged. See scoreboard-display.md for fields, bounds and recovery.

Scoreboard correction: `/scoreboard.html` is now the canonical themed gameplay-HUD frame using the original upper/lower geometry and binding IDs. scoreboard-display.html redirects with its query intact. It consumes the shared sponsor playlist. The OCR scoreboard remains unchanged. This supersedes the compact scoreboard composition and the earlier note that scoreboard.html stays fixed.

Scoreboard sponsor placement: the shared playlist now renders at the top of the right-side match-info panel; match/game is one line beneath it, with optional stage/group using scoreboardocr's matchInfo.stage/group (season/week fallback) fields. No OCR statistics or timer elements are introduced. This supersedes the center sponsor-slot placement.

Right-panel format correction: use two adjacent columns, colored metadata left and white sponsor right, height 116px. Stage/group and match/game bindings remain unchanged. This supersedes the previous vertical stack.

Scoreboard palette adapter: settings use their own scoreboard scope, while CSS generation uses the scoreboard render target and data-scoreboard-theme selector. Color data schema 2 separates the scopes. Only scoreboard semantic variables are emitted; draft geometry rules are excluded.

## Scoreboard production branding
`/api/scoreboard-branding` owns global patchLabel/casterNames and one tournament logo, independent of match, palette and sponsor data. Text saves and logo upload/removal require If-Match; atomic persistence precedes scoreboard_branding_update. The logo uses generated immutable assets in runtime/scoreboard-logos; state is runtime/scoreboard-branding.json. See scoreboard-branding.md.

Color schema 2: /api/broadcast-colors accepts roster, draft or scoreboard output scopes. On loading a version-1 file, preserve a .v1.bak backup and copy missing scoreboard palettes from the previous draft overrides once before atomically persisting version 2. Subsequent scoreboard resets and restarts do not fall back to draft values.

## Post-draft output
The catalog declares postdraft coverage and per-theme postdraftStyles. Canonical postdraft2.html consumes existing match/draft snapshots and events through a single read-only renderer, preferring catalog GIF assets with static fallback while preserving unchanged image nodes/sources. The color API accepts an independent postdraft scope under schema 2; no existing scopes are copied or changed. See postdraft-display.md.

Post-draft tournament identity: consume only logoFile from the existing scoreboard-branding GET/event contract for center logos in all layouts. This remains read-only; patch/caster strips and all output palette scopes remain independent.


## Individual player notification cues

Existing `POST /api/notification` and `notification_trigger` remain the single notification transport. General `{videoId:"videoPlayer1"…"videoPlayer12"}` requests keep their clips and shortcuts. Unknown video IDs are rejected with 400 rather than broadcasting an unusable cue.

Individual commands use `{eventId,teamSide:"blue"|"red",playerIndex:0…4,expected}`. The shared notification catalog defines the ten events. `expected` contains the rendered `playerName`, `teamName`, `gameNumber` and `matchInfo`. The server compares that complete context to the committed match snapshot, returning 409 if the player/team/game has changed; missing/invalid selection/context is 400. It resolves broadcast names from the server, never from client-supplied attribution. Slot identity remains positional because stable player IDs are not yet part of the match contract; an identical lineup/reset cannot be distinguished.

Accepted cues carry `type:"notification_trigger"`, unique `id`, `timestamp`, `scope`, and `videoId`; player cues additionally carry `eventId`, `eventLabel`, `teamSide`, `playerIndex`, `playerName`, `teamName`, `playerImages` and `teamLogo`. Player asset candidates are resolved server-side through the existing roster photo resolver, excluding generic no-player/transparent placeholders. **Every individual cue has `videoId:null`**, including kills and objectives. The general video ID mapping is unchanged. All individual events use a four-second lower-third in the same overlay. The HTTP acknowledgement means dispatched, not verified rendered in OBS. Cues are ephemeral: no state mutation, no durable queue, and no replay after reconnect. The pre-existing notification.json is only a best-effort last-cue diagnostic with its currentVideo/timestamp compatibility fields.

Both control variants render the read-only player panel from ControlMatch and block player sends while match edits are dirty/pending/blocked. They preserve general controls/shortcuts. The existing notifdisplay.html consumes cues via the shared socket lifecycle, interrupts the prior cue like the legacy overlay, retains general WebM animation/timing, and presents individual cues as a separate lower-third with player photo or team-logo fallback. Individual cues never enter the video playback branch, even if a cached/older sender includes a video ID. The lower-third has a 560ms center-out barn-door entrance and an 800ms reverse closure, including the protruding portrait; missing artwork leaves readable text. Errors on general media clear the source, and stalled general clips have a bounded watchdog. Reconnect and refresh never replay a previously fired notification.
