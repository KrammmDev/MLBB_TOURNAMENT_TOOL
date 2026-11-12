# Broadcast theme colors

In Broadcast Themes, choose a theme and output, then use **Theme colors**. Panel background, left/right team accents, primary/secondary text and borders accept a picker or six-digit HEX value. Colors are saved independently for each Classic/Arena/Studio roster, draft and scoreboard scope.

Edits affect only the preview until **Save colors**. Saving publishes the palette to connected outputs without changing the selected theme, match, draft, artwork or layout dimensions. Unsaved valid edits survive switching preview scopes. Theme activation is disabled while the current scope has unsaved colors. **Reset to default** previews the original stylesheet; save to publish that reset. **Reload saved colors** discards the current scope's draft. A conflicting save from another panel preserves edits and asks the operator to reload.

New draft outputs, including six-ban mode, scoreboard outputs and shared roster outputs receive colors. Legacy fixed draft pages retain their original appearance. Fixed Classic/Arena roster URLs receive their corresponding roster palette. Canvas transparency is preserved; artwork is never recolored. Reset removes sparse overrides, restoring the original gradients rather than approximating them with solid colors.

## State and delivery

`runtime/broadcast-colors.json` is separate, Git-ignored production state. Include it in runtime backups. Restart the server after installing this feature for its new routes. Invalid saved files stop startup and remain available for repair/restore.

`GET /api/broadcast-colors` returns `{data, revision}`. `PUT` accepts `{themeId, output, colors}` with `If-Match`; missing and stale revisions return 428 and 409. Only the six known keys and `#RRGGBB` values are accepted. An empty palette resets one scope. Writes serialize and persist atomically before the existing WebSocket broadcasts `broadcast_colors_update`. Failed writes retain prior state. No match/draft/theme-selection write is involved.

The renderer uses scoped CSS overrides and the existing socket, with recovery polling. A failed read retains the last known colors or original styles. Iframe previews accept same-origin parent messages only and cannot save settings. Color controls retain local edits rather than polling over focused fields.

## Verification

Node tests cover API validation, conflicts, independent scopes, restart/reset, failed persistence and corrupt-file preservation. Chromium tests cover all six theme/output combinations, six-ban draft mode, preview isolation, reset/save, scope switching, concurrent operators, reload/reconnect, transparency, hero DOM preservation and clock warnings. Actual Windows/OBS Browser Source appearance remains an operator check before live use.

Arena hero labels retain their transparent-to-dark gradient when team accents change. Classic applies a contrasting text fallback on its light center/header panels and colored name rails when a selected text color would disappear against the surface; this also repairs previously saved palettes without requiring a reset.

Classic's theme CSS binds its inherited corner brackets, glow, hero-rail edges, clock-bar fills and stat-header gradients to the same team accents. Its sponsor panel follows the panel background. These details previously retained fixed orange/red colors despite palette changes.

## Independent scoreboard palettes (color schema 2)
Roster, draft and scoreboard have distinct stored palettes, editor scopes and reset behavior for each theme. The editor retains unsaved edits independently when switching outputs. Scoreboard rendering remains isolated from draft geometry rules.

On the first updated server start, a schema-1 color file is backed up to `broadcast-colors.json.v1.bak`, then migrated atomically to schema 2. Existing draft overrides are copied once into missing scoreboard scopes to retain the current appearance; existing scoreboard scopes are preserved. All later saves/resets are independent, and restarting never recopies draft colors. Empty/new installations start with independent defaults. Restart the server and refresh open pages after updating. A rollback to an older server requires restoring the schema-1 color backup.

## Post-draft colors
Post-draft has its own `postdraft` scope and defaults under schema 2. Select Post-draft in Broadcast Themes; edits preview locally until Save colors. This scope is independent of all other outputs and does not require a palette migration.
