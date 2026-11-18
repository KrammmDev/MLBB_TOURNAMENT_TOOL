# Post Game Tournament capture frame

Add `/postgame-tournament.html` as an OBS Browser Source at **1920 × 1080**. The graphic follows the tournament title, both team names/logos, game number and BLUE WIN / RED WIN state from the existing Control Panel. It does not recreate or invent player stats.

Put your MLBB game capture or results screenshot **below** this Browser Source in the OBS source list. Crop the game capture to the results table, then set its position to **X 260, Y 220** and size to **1600 × 800**. Use OBS Edit Transform and adjust the crop to match your captured screen. The frame's middle is genuinely transparent; no chroma key is needed. A single captured table shows the in-game data as supplied; it does not transform it into the custom player-card layout in the reference.

Hub → Control Panel → **Post Game Tournament Colors** opens `/postgame-tournament-control.html` with preview, save, reset and reload. This uses the independent `arena/postgame` palette. Restart the Node server once after installing to register the new color output. Hub → Display Overlay → **Post Game Tournament** opens the OBS page.

The frame stays visible even before a winner is selected. With no winner selected it shows neutral team labels; selecting a winner marks VICTORY/DEFEAT and dims the losing header. Missing logos are hidden while team names remain visible.

Validation: `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/postgame-tournament-browser.spec.js` verifies transparent window geometry, no opaque overlap, live winner/title/team changes, plain text labels, independent color saving, responsive scaling and a read-only overlay feed.

The slash markers sit directly beside the VICTORY/DEFEAT labels. They follow `matchFormat` and each team's `score` from `control.html`: BO1=1 slot, BO3=2, BO5=3, BO7=4 (fallback BO3). Filled slashes represent wins; solid gray bars represent remaining wins needed. Both teams update immediately, including score reductions and format changes. No separate center LINE SCORE block or visible score numbers are shown. Values are clamped to the series target.

For readability, slash slots use 8×26px shapes with solid gray fills at full opacity; wins have accent fill. Defeated names/logos stay dimmed and grayscale, while result labels and markers retain full opacity.

Result groups mirror the latest reference: blue-side label then bars, red-side bars then label, with opposite slants. Bars use compact 4px gaps. BO format and score behavior are unchanged.
