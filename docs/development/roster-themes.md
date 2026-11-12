# Roster renderer and shared theme selection

## Operator workflow
After pulling main and restarting the server, open `/broadcast-themes.html` from the hub or either control panel's Broadcast themes link. Choose a preset to preview it with current match data. Only **Use for roster + draft outputs** saves the selection. The Output selector now also previews normal/6-ban draft graphics; it does not change controller rules. Preview previous look lets you inspect the last selection before choosing it again; it does not publish immediately.

Add `/broadcast-overlay.html` to OBS as a 1920×1080 Browser Source to follow the saved roster selection. The page includes a complete URL with the host/port used by the operator browser. Existing `/overlay-display.html` and `/overlay-display-v2.html` remain pinned to Classic and Arena respectively; they are compatibility URLs, not subscribers to the new selection. `/broadcast-overlay.html?theme=studio` pins a preview without writing settings.

Classic and Arena retain the existing asymmetric and three-column roster layouts. Studio is a new restrained slate preset with blue/coral accents. These are working presets for **roster and the new draft output**, not three finished broadcast packages. In-game scoreboard, lower thirds, schedule/brackets, winner, MVP and postgame outputs retain their prior appearance. The existing theme editor and `/api/theme` remain separate and unchanged. OCR stays on hold.

## Shared behavior
`roster-renderer.js` owns match binding, branding, image fallback, slide lifecycle, countdown and canvas fitting for all looks. The two legacy JavaScript entry points now only select their fixed preset. `roster-model.js` normalizes player/image data and compares complete image URLs, fixing updates that previously went undetected when URLs had the same length. DOM text and image properties replace interpolated sponsor/player HTML. Valid short asset URLs work for team logos.

Match events render their supplied snapshot directly rather than issuing a GET for each event. The shared client still fetches current snapshots on reconnect and uses recovery polling. Branding consumes only the allowlisted tournament/sponsor/countdown keys from the existing WebSocket storage mirror and browser storage events; it does not republish browser storage or create a new writable match authority. Countdown has one interval, and theme changes preserve roster DOM and active pair while settling outgoing animation.

The versioned catalog in `public/script/roster-themes.js` specifies renderer version, 1920×1080 canvas, output coverage, style files, separator and exit timing. All presets now declare `roster` and `draft` coverage; the latter uses `draftStyles` and the original display2 markup with separate layout styles. Classic retains the orange/red/white composition, Arena uses a navy/cyan tournament stage with subtly mirrored frames and upright portraits, a score header and sponsor footer, and Studio uses wider team banks with header branding and a slim white clock column. All three new draft themes share a top-center sponsor slideshow. See draft-display.md and broadcast-sponsors.md. Classic's external web-font import remains optional: if the outer stylesheet loads but the font import fails, its declared system font fallback is usable. The Studio roster uses system fonts directly; draft layouts inherit display2 typography with fallback fonts. Missing player/logo images have a bounded fallback chain and are hidden if none loads.

## Persistence and activation
`lib/roster-theme-store.js` loads `runtime/roster-theme.json`, creating Classic as the initial selection only when the file is absent. Runtime state is ignored by Git and survives code pulls. A corrupt saved theme file fails startup with a clear error and is not overwritten; preserve it and repair/restore a valid configuration before restarting.

Theme writes are serialized, revision-guarded and atomically persisted before notification. They never write match, draft or legacy theme data. The browser stages styles before replacing the loaded style set. A failed replacement retains the previous loaded look and retries during reconnect/reconciliation. Rapid changes use latest-intent cancellation. Preview also waits for style readiness before enabling activation.

Activation is best effort per connected roster source, **not** a synchronized all-source barrier or proof of OBS on-air state. A disconnected source reloads current settings when it reconnects; a source with a missing stylesheet can retain its last loaded look even though a newer selection is saved. Check the actual Browser Source before live use.

## Verification
`npm test` includes theme serialization, stale revisions, failed persistence/recovery, restart/corrupt-file handling, HTTP catalog and selection, image-source rules and complete image identity, plus existing match/startup regressions. The actual server startup fixture also saves a theme through HTTP and verifies that match data is unchanged.

`npm run test:browser` includes both legacy roster URLs, a following output, two operator pages, preview isolation, activation with active-pair preservation, stale selection conflict, previous-look selection, a fresh-browser stylesheet failure, reconnect recovery, same-length image updates, metadata as text, scaling and the earlier control/postgame scenarios. Browser fixtures substitute simple silhouette artwork; screenshots were inspected for layout, clipping and transparency. Real Windows/OBS rendering remains a target-machine check.

Skills used: Broadcast Design System, Broadcast Core, Production Validation and Production Workflows. Next extend coverage to additional broadcast outputs before treating a preset as a full production package. Authored decorative branding/default titles are prohibited; see the current user constraint in project-context.md.

## Color customization
Broadcast Themes now provides per-theme, per-output color preview/save/reset controls for roster and new draft outputs. See [broadcast-colors.md](broadcast-colors.md) for operator workflow, persistence and delivery behavior.

## Scoreboard coverage
The catalog also declares scoreboard support. Broadcast Themes previews the new scoreboard output, which follows the saved selection and uses an independent scoreboard color palette. Original scoreboard pages remain compatible. See [scoreboard-display.md](scoreboard-display.md).

Scoreboard source correction: use scoreboard.html for the three gameplay-HUD layouts; scoreboard-display.html is a compatibility redirect. The shared sponsor playlist also appears in its center slot. See scoreboard-display.md for the actual safe areas.
