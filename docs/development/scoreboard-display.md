# Themed gameplay scoreboard

Use `/scoreboard.html` as a transparent 1920×1080 OBS Browser Source. It now follows the existing saved broadcast selection. Pin a look with `?theme=classic`, `?theme=arena` or `?theme=studio`. Broadcast Themes includes **In-game scoreboard** with preview and a copyable source URL. `/scoreboard-display.html` redirects to this canonical page, preserving theme query parameters.

## Layout contract

The composition follows the original scoreboard.html geometry rather than a compact score bar. It preserves the original upper/lower rows, team name/logo and score/turtle element IDs. All three designs leave the minimap at x=0..342 and the upper-center gameplay HUD open, with transparent gameplay below. The frame starts at x=342 and ends at x=1920, y=0..116. The top-center cutout spans roughly x=528..1394 at y=0, tapering to x=548..1374 at y=52. Logo banners sit at x=394 and x=1415, names/series indicators at y=62..116, and match/game info in the right panel. The right panel is split into adjacent columns at x≈1530..1725 for colored match details and x≈1725..1920 for the white sponsor tile. Both are 116px tall. Actual HUD alignment must be verified with the game feed in OBS.

Classic has flat white framing with narrow orange/red logo rails and shallow cuts, Arena has navy framing with thin cyan/blue edges and horizontal win markers, and Studio has square white panels with slim blue/red base accents. CSS creates the framing without copying league branding from a background bitmap. The right-side sponsor slot stays empty when the playlist is disabled. Long names use ellipsis, logos use contain sizing, and failed images hide without shifting the layout. The full canvas scales proportionally for previews.

The scoreboard shares each theme's **draft palette**. When previewing Scoreboard, the Theme colors scope reads Draft; saved colors update both outputs. Preview edits remain iframe-only until Save colors. Roster palettes remain independent. The existing scoreboardocr page is unchanged; this feature does not start OCR.

## Binding and recovery

One read-only scoreboard renderer consumes MatchDataClient and the shared staged theme/color clients. It replaces the old page's duplicate match polling and browser-storage mirror. Team names/logos, series wins and turtles come from teamdata.blueteam/redteam. matchFormat controls BO1/3/5/7 win markers. Turtles use turtles with legacy turtle fallback, capped at three. Match/game labels use matchInfo with game_number as a fallback. No decorative title or league logo is inserted.

The right-panel SponsorSlideshow reads the shared playlist and receives sponsor updates through the same socket. No separate sponsor state is created. Match snapshots recover on reconnect/poll, failed theme loads retain the prior style set, and page hide/restore stops/resumes subscriptions. Theme switches preserve bound DOM and scores.

## Verification

Chromium checks the canonical URL and compatibility redirect, all three presets, pinned versus following outputs, preview isolation, shared draft-palette saves, sponsor display, text-safe names, series/turtle/game updates, reconnect/reload, transparency and scaling. Hit testing verifies that frame/banner graphics do not cover minimap, game HUD or gameplay safe points. Screenshots use synthetic logos and cannot establish final placement against the actual game feed. Windows/OBS verification remains a target-machine check.

## Right-side sponsor and OCR-style metadata
The right panel places optional matchInfo.stage/group fields (season/week fallbacks) and a single `matchInfo.match | matchInfo.game` line in the left colored column, beside the white sponsor-logo column on the right. Typography uses the existing Roboto Condensed Bold asset with system fallbacks. Flat adjacent tiles and rectangular win markers keep the design restrained. Missing fields clear and hide rather than retaining old match metadata. It uses the scoreboardocr metadata arrangement without loading its OCR script or adding lord, gold, tower, kill score or timer elements. Existing series indicators and turtle counters remain.
