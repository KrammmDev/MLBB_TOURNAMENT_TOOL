# Match Winner overlay

Open `/matchwinner.html` as an OBS Browser Source at **1920 × 1080**. The canvas is transparent around a centered esports result panel; only the winning team's logo and name are needed. Local Chakra Petch/Oxanium webfonts are reused from the bundled font library.

In `/control.html`, **BLUE WIN** or **RED WIN** selects the winner using the existing `winmatches` field. The overlay reads the live match API/WebSocket feed without changing it. It displays `game_number` and the winning side's `teamname`/`logo`. With `winmatches` cleared to `none`, the graphic exits and hides. Current winner state also loads when the Browser Source is refreshed.

Winner-side/game changes reveal the graphic once. Unchanged polling and live name/logo corrections do not repeatedly restart the entrance. Missing, unsafe or failed logos use a centered name-only layout. Labels render as plain text, long team names fit the panel, and reduced-motion preference removes movement. The whole 1920×1080 stage scales to the preview viewport.

Validation: `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/match-winner-browser.spec.js` checks blue/red/none states, logo/name-only fallback, safe labels/URLs, stable animation under repeated data and polling, responsive placement, reduced motion, and read-only behavior.
