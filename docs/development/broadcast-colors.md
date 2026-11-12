# Broadcast theme colors

In Broadcast Themes, choose a theme and output, then use **Theme colors**. Panel background, left/right team accents, primary/secondary text and borders accept a picker or six-digit HEX value. Colors are saved independently for each Classic/Arena/Studio roster and draft scope.

Edits affect only the preview until **Save colors**. Saving publishes the palette to connected outputs without changing the selected theme, match, draft, artwork or layout dimensions. Unsaved valid edits survive switching preview scopes. Theme activation is disabled while the current scope has unsaved colors. **Reset to default** previews the original stylesheet; save to publish that reset. **Reload saved colors** discards the current scope's draft. A conflicting save from another panel preserves edits and asks the operator to reload.

New draft outputs, including six-ban mode, and shared roster outputs receive colors. Legacy fixed draft pages retain their original appearance. Fixed Classic/Arena roster URLs receive their corresponding roster palette. Canvas transparency is preserved; artwork is never recolored. Reset removes sparse overrides, restoring the original gradients rather than approximating them with solid colors.

## State and delivery

`runtime/broadcast-colors.json` is separate, Git-ignored production state. Include it in runtime backups. Restart the server after installing this feature for its new routes. Invalid saved files stop startup and remain available for repair/restore.

`GET /api/broadcast-colors` returns `{data, revision}`. `PUT` accepts `{themeId, output, colors}` with `If-Match`; missing and stale revisions return 428 and 409. Only the six known keys and `#RRGGBB` values are accepted. An empty palette resets one scope. Writes serialize and persist atomically before the existing WebSocket broadcasts `broadcast_colors_update`. Failed writes retain prior state. No match/draft/theme-selection write is involved.

The renderer uses scoped CSS overrides and the existing socket, with recovery polling. A failed read retains the last known colors or original styles. Iframe previews accept same-origin parent messages only and cannot save settings. Color controls retain local edits rather than polling over focused fields.

## Verification

Node tests cover API validation, conflicts, independent scopes, restart/reset, failed persistence and corrupt-file preservation. Chromium tests cover all six theme/output combinations, six-ban draft mode, preview isolation, reset/save, scope switching, concurrent operators, reload/reconnect, transparency, hero DOM preservation and clock warnings. Actual Windows/OBS Browser Source appearance remains an operator check before live use.
