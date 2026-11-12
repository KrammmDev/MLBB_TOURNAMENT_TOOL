# MLBB project context
Source: https://github.com/KrammmDev/MLBB_TOURNAMENT_TOOL
Inspected source revision: d475d6979edf392b8440693ecde84ad72643ca09. Recheck current code before implementation.

## Observed existing implementation
Node CommonJS, Express ^5.1.0, ws ^8.18.3, Multer ^2.0.2, Playwright ^1.62.0. npm start runs node server.js; npm test is a failing placeholder. Plain HTML/CSS/JS; no framework migration is required by this plan.

server.js serves public/ on port 3000, with in-memory cache, JSON persistence and a shared write queue. POST /api/matchdata replaces cache.matchdata from req.body and broadcasts updates. Other APIs handle matchdraft, theme, schedule, mapdraw, MVP, notifications, hero stats, tournament, archives and group preferences. crosshost.js/crossclient.js mirror browser storage through WebSockets. Do not mistake these overlapping paths for a unified authority contract.

Draft controls: public/control.html, controlban6.html and public/script/herodropdown*.js. Tournament rules/UI: public/controller.html. Other operator surfaces: postgamecontrol.html, schedulecontrol.html, panel.html and hub.html. Shared theme loader: public/script/theme-loader.js; server theme assets/config use public/Assets/costum/Theme/. public/database/theme.json also exists; confirm actual consumers before changing paths. overlay-display-v2.js duplicates much of overlay-display.js behavior. Multiple outputs poll APIs as well as use events.

Legacy OCR: public/script/scoreboaedocr.js tries http://localhost:14337/MLBB.json then a serverip-derived host. public/External/ holds ScoreSight settings. Windows batch launchers exist. No implemented custom OCR or obs-websocket control layer was established by inspection.

## Approved direction
Professional MLBB broadcast tool, three interchangeable complete themes, original MPL-inspired production quality. Build custom OCR in the SAME project folder/repository with an integrated panel and a single start/stop entry point. A supervised worker is compatible with this requirement; do not make a separate app/repository. Initial OCR fields: kills, gold, towers and game timer.

User uses OBS Virtual Camera and reports a clear OBS view but blurry/inaccurate OCR reading. Color Key is involved, but its exact placement and causal effect remain unverified. No representative screenshot/feed is available. The uploaded FalseOCR EXE exceeded a 32 MiB transfer limit and was not inspected or executed. Do not depend on it or describe its internals as known.

## Planned, not yet implemented
OCR capture/calibration UI, custom recognition engine, normalized ingestion API, field ownership/manual override, versioned theme manifests and supervised unified launcher improvements. Choose engine/runtime only after testing useful capture and target-machine constraints. No native-camera or actual OBS behavior has been validated in this skill-writing task.


## Current development priority
OCR is on hold at the user's request. The first broadcast architecture increment extracts match persistence/routes, adds guarded field-level PATCH and migrates the postgame editor. See state-foundation.md and the implemented section of contract-register.md. Legacy whole-document writers, stable identities, draft state and shared overlay/theme rendering remain subsequent migration work.

The second increment migrates both main control variants, shared nickname/logo handlers and match hero/ban mirrors to the field-patch API. See control-migration.md and the phase-2 contract section. Existing control layouts and draft sequences remain; shared overlay/theme rendering is next, and OCR stays on hold. The draft JSON API is still separate from match persistence.

Phase 3 adds one shared roster renderer, Classic/Arena compatibility entry points, a new Studio roster preset, `/broadcast-themes.html` for isolated preview and guarded activation, and `/broadcast-overlay.html` for the selected roster output. Persisted roster appearance lives in ignored `runtime/roster-theme.json` and does not replace legacy `/api/theme`. See roster-themes.md for limited output coverage and source-recovery semantics; this is not three complete broadcast packages yet.

Phase 4 adds `/draft-display.html` with normal/6-ban format mappings, a shared read-only draft renderer, and draft styles for the existing preset IDs. The theme UI previews roster or draft; the same saved selection covers both new outputs. Broadcast aliases retain the existing roster store and event compatibility. Primary legacy draft pages share rendering but preserve geometry. Live clock fields are mirrored into server memory for accurate REST/reconnect reads; full draft writes/rules remain unchanged.

User constraint for all subsequent graphics: **no authored decorative text such as MLBB, league names, slogans or placeholder titles**. Only actual match/operator data and functional phase/clock indications belong on the broadcast graphic. Automatic roster branding defaults and Arena's edge slogan have been removed. Explicit entered data is not censored. See draft-display.md. OCR remains on hold.

Studio draft now uses the reference's center sponsor/match/phase/clock/team composition without BPM or an authored league logo. Broadcast Themes owns a separately persisted sponsor playlist with upload, ordering/removal, interval and enabled controls. The playlist is displayed only by the new Studio draft (normal/six), with no match or draft mutation. See `broadcast-sponsors.md`.

Draft polish: the shared sponsor playlist is now visible in Classic, Arena and Studio. Studio's gold trapezoid is removed in favor of a flat white/slate center. Arena uses a compact navy composition with separate horizontal player-name ribbons and portraits aligned to the top of their cards. Legacy display URLs and roster sponsorship are unchanged.

The user requires visibly different esports compositions, not recolors. Current draft layouts: Classic original center console; Studio slim white clock column with branding in team headers; Arena dark navy/cyan tournament stage with straight portrait banks, one clock and numeric series scores in the header, and sponsors/bans/coaches in the footer. The user rejected the angled-card/white-wedge reference. All consume the same draft/match bindings and sponsor playlist.

Latest Arena refinement: keep the navy/cyan stage and footer, but angle the left cards outward left and the right outward right, reversing the rejected reference. Keep artwork/labels upright, name bars horizontal and the white wedge removed.

The latest Arena reference clarifies a subtle mirrored angle: left frames +4 degrees, right -4 degrees. This supersedes the earlier outward -8/+8 interpretation. Artwork and labels stay upright and the navy/cyan stage is retained.

Draft presentation constraint: once a slot has a selected hero, hide the player portrait (including during stat cards and match refreshes); restore it for empty/reset slots. Remove Arena's large numeric series scores. Keep stored match scores and the small series-win indicators.

Arena team branding uses raised upper-left/right dark panels with mirrored slanted inner edges, 80px logos and names up to 36px (auto-fit for long names). Size variables live in `public/themes/draft-arena.css`.

Broadcast Themes includes preview-only color editing and explicit save/reset for each theme's roster/draft palette. Runtime settings live in broadcast-colors.json, independently of competition state. This change leaves Arena geometry CSS untouched to preserve operator width adjustments. See broadcast-colors.md.

Themed in-game scoreboard is now available at scoreboard-display.html and in Broadcast Themes previews. Its three presets align with current draft designs and share saved draft colors. The existing scoreboard and OCR URLs remain unchanged. No new match state, OCR or league branding is introduced. Actual gameplay-HUD positioning in OBS still needs target-machine verification.

User correction: the scoreboard must follow the original scoreboard.html gameplay-HUD template and its open minimap/top-center spaces, not the compact desk introduced in PR18. The canonical scoreboard.html now has three CSS frame/banner designs, the original binding IDs, and a center sponsor slot. scoreboard-display.html is a redirect alias. Do not reintroduce a filled compact bar over the gameplay HUD.

Latest scoreboard direction: put the sponsor in the right panel above the single `GRAND FINALS | GAME 3` line. Support scoreboardocr-style stage/group metadata when supplied, but do not include lord/gold/tower/kill-score/timer UI or invoke OCR. Apply this arrangement to all three themes.

Final scoreboard reference correction: match metadata and sponsor are SIDE BY SIDE. The colored left tile contains stage/group/match-game lines; the white right tile contains the sponsor logo. This supersedes the prior vertical sponsor-above-text interpretation for all three themes.

Scoreboard visual refinement: retain the exact HUD/panel arrangement while simplifying decoration. Use the existing Roboto Condensed Bold font, flat surfaces, thinner accent rails, shallow/square logo panels and rectangular series markers. Remove gradients, diamond indicators and metadata notches.

Scoreboard themes must differ in composition, not only palette: Classic has colored name plates and shield logos; Arena has raised names and bottom win rails; Studio has centered names and a second row of square wins. Saved draft values are shared but rendered through an isolated scoreboard color adapter. Never apply draft .upper/.lower/.uppermid style rules to scoreboard markup.

Broadcast Themes includes patch label/caster controls and a separate tournament-logo upload for all three scoreboards. Patch/caster strip is below the right-hand metadata/sponsor panels; the center tournament logo extends 25px below the frame. These blank-by-default settings persist independently in scoreboard-branding.json and do not introduce OCR or decorative league branding.

User correction: Draft and Scoreboard must have independent color editors and saved palettes. The output selector now selects a separate scoreboard scope, with independent preview/save/reset. Color schema 2 copies legacy shared values once at startup to preserve appearance, then separates every later change; it keeps the original schema-1 file as a .v1.bak backup. This supersedes all earlier shared-draft-palette notes.

Postdraft2.html now uses one shared renderer for three distinct compositions: Classic tall panels/colored name bars, Arena staggered dark cards, Studio separate light portrait/name desks. Resolve stored static picks through the hero catalog to animated GIFs and never reset unchanged IMG src during polling/theme changes. Post-draft colors have their own scope, independent of draft, scoreboard and roster.
