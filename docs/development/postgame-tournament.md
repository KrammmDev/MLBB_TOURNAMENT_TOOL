# Post Game Tournament capture frame

Add `/postgame-tournament.html` as an OBS Browser Source at **1920 × 1080**. The graphic follows the tournament title, both team names/logos, game number and BLUE WIN / RED WIN state from the existing Control Panel. It does not recreate or invent player stats.

Put your MLBB game capture or results screenshot **below** this Browser Source in the OBS source list. Crop the game capture to the results table, then set its position to **X 260, Y 220** and size to **1600 × 800**. Use OBS Edit Transform and adjust the crop to match your captured screen. The frame's middle is genuinely transparent; no chroma key is needed. A single captured table shows the in-game data as supplied; it does not transform it into the custom player-card layout in the reference.

Hub → Control Panel → **Post Game Tournament Colors** opens `/postgame-tournament-control.html` with preview, save, reset and reload. This uses the independent `arena/postgame` palette. Restart the Node server once after installing to register the new color output. Hub → Display Overlay → **Post Game Tournament** opens the OBS page.

The frame stays visible even before a winner is selected. With no winner selected it shows neutral team labels; selecting a winner marks VICTORY/DEFEAT and dims the losing header. Missing logos are hidden while team names remain visible.

Validation: `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/postgame-tournament-browser.spec.js` verifies transparent window geometry, no opaque overlap, live winner/title/team changes, plain text labels, independent color saving, responsive scaling and a read-only overlay feed.

The header displays LINE SCORE as slanted win markers, not visible numbers. Filled markers represent wins from each team's `score`; empty outlines represent remaining wins needed. `matchFormat` controls the slots: BO1=1, BO3=2, BO5=3, BO7=4 (default BO5). Score changes and corrections update live. Missing/invalid scores show no filled markers; scores are clamped to the series target. Accessible labels provide the numeric meaning. These markers are separate from kill totals in the captured results screen.
