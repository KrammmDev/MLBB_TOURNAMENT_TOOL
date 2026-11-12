# Scoreboard production details

Broadcast Themes includes **Scoreboard details**. Enter a patch/broadcast label (up to 64 characters) and caster names (up to 100), then **Save details**. Blank fields hide their content; when both are blank the footer strip is hidden. These are global scoreboard settings shared by Classic, Arena and Studio, independently of match state, theme palettes and the sponsor playlist.

The patch and caster strip sits at x=1530, y=116, width=390, height=26 under the right-hand tiles. The caster cell includes a microphone icon and follows the right team accent. Values are rendered as text, with long content clipped/ellipsized to the available cell.

Upload the separate **Tournament logo** as PNG/JPEG/WebP/GIF, up to 3 MB. Upload publishes immediately to all scoreboard themes; **Remove logo** clears it. A transparent PNG is useful for shaped logos. The logo uses contain sizing at x=908, y=45, width=104, height=96, extending 25px below the 116px scoreboard frame while staying inside its center gap. Empty or failed images remain hidden; failed loads retry on subsequent settings refresh. This does not move the sponsor playlist from its right-hand tile.

Unsaved text fields remain local until Save details. Upload/remove preserves these text edits; save them separately when ready. **Reload details** discards local text edits and loads the latest settings. Another operator's save produces a revision conflict instead of overwriting their changes. No placeholder production title, patch or caster name is inserted.

## Persistence and transport

`runtime/scoreboard-branding.json` and `runtime/scoreboard-logos/` are Git-ignored production state; back up both. Restart the updated server after pulling to install the new routes. Missing settings initialize empty; invalid saved settings stop startup without replacing the file.

- GET `/api/scoreboard-branding` returns `{data, revision}`.
- PUT accepts `{patchLabel, casterNames}` and requires If-Match.
- POST `/api/scoreboard-branding/logo` accepts one multipart `logo` with If-Match.
- DELETE the same logo endpoint clears the logo with If-Match.
- Uploaded files use generated immutable names and a supported image signature. Stale/failed uploads remove their unpublished file.
- Missing/stale revisions return 428/409. Writes serialize and persist atomically before `scoreboard_branding_update` is broadcast through the existing socket. Failed persistence retains prior acknowledged data.

The read-only scoreboard client consumes that event and recovery polling; it never writes match or draft state. The admin form does not poll over focused edits. Existing sponsor uploads remain separate.

## Validation

Node checks cover save/upload, revision conflicts, invalid input/image rejection, stale-file cleanup, restart, clearing/removal, corrupt-file preservation and failed-write recovery. The scoreboard browser scenario saves production text, uploads a tournament logo, checks the center overlap and footer in all themes, then exercises the existing palette, match and reconnect paths. Synthetic artwork verifies bounds; actual Windows/OBS readability remains a target-machine check.

The same tournament logo is also used in the three post-draft compositions. The upload label identifies both output types. Patch/caster strips remain scoreboard-only; the logo is shared tournament identity and does not share palette settings.
