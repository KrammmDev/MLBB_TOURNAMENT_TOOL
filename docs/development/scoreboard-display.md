# Themed in-game scoreboard

Use `/scoreboard-display.html` as a transparent 1920×1080 OBS Browser Source. It follows the existing saved broadcast selection. Pin a look with `?theme=classic`, `?theme=arena` or `?theme=studio`. Broadcast Themes includes **In-game scoreboard** in its Output selector, with a preview and copyable source URL; the hub lists the new source alongside the original scoreboard.

Classic uses the current orange/red/white treatment, Arena uses navy/cyan panels with mirrored inner cuts, and Studio uses white desks with blue/red edge accents. All use one renderer and the same match data. The bar occupies x=394 through 1526, y=18 through approximately 124 on the 1920×1080 canvas. Verify placement against the actual gameplay HUD in OBS before live use; the page scales proportionally for smaller previews. Long names use ellipsis, logos use contain sizing, and missing logos become invisible while retaining layout space. No default league branding or match title is authored.

The scoreboard shares each theme's **draft palette** so the in-game graphics match current draft colors. When previewing Scoreboard, the Theme colors scope therefore reads Draft; saved colors update both draft and scoreboard. Preview edits remain iframe-only until Save colors. Roster colors stay independent. Original fixed scoreboard and OCR URLs remain unchanged.

## Binding and recovery

`scoreboard-renderer.js` consumes the existing MatchDataClient subscription and theme/color events. Team names/logos, series wins and turtle counters come from `teamdata.blueteam/redteam`. Series dots use matchFormat (BO1/3/5/7); turtles use `turtles` with legacy `turtle` fallback. Match/game labels use matchInfo, with game_number as a game fallback. Empty labels stay empty. Turtle icon count is capped at three and series wins at the configured winning target.

The output is read-only: it neither writes match state nor starts OCR, timers or an alternate storage authority. It renders supplied match events and recovers snapshots on reconnect/poll. Themes use the shared staged stylesheet loader; failed styles retain the prior look. Page hide stops subscriptions/polling; page restore resumes. Theme switches do not reconstruct team/logo markup or reset scores. Color settings use the existing palette client.

## Verification

The scoreboard Chromium scenario checks all three themes using the same fixture, following versus pinned outputs, preview isolation, draft-palette save propagation, text-safe team names, score/turtle/game updates, reconnect/reload, canvas transparency and scaling. Synthetic artwork tests placement rather than final brand appearance. Existing Node and browser regressions cover shared theme/color behavior. Windows and actual OBS/gameplay-HUD placement remain target-machine checks.
