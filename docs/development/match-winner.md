# Match Winner overlay

Open `/matchwinner.html` as an OBS Browser Source at **1920 × 1080**. The result fills the entire 1920×1080 canvas when visible; both teams use only their logo and name. Local Chakra Petch/Oxanium webfonts are reused from the bundled font library.

In `/control.html`, **BLUE WIN** or **RED WIN** selects the winner using the existing `winmatches` field. The overlay reads the live match API/WebSocket feed without changing it. It displays `game_number` and both sides' `teamname`/`logo`. With `winmatches` cleared to `none`, the graphic exits and hides. Current winner state also loads when the Browser Source is refreshed.

Winner-side/game changes reveal the graphic once. Unchanged polling and live name/logo corrections do not repeatedly restart the entrance. Missing, unsafe or failed logos fall back to the team name. Labels render as plain text, long team names fit the panel, and reduced-motion preference removes movement. The whole 1920×1080 stage scales to the preview viewport.

Validation: `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/match-winner-browser.spec.js` checks blue/red/none states, logo/name-only fallback, safe labels/URLs, stable animation under repeated data and polling, responsive placement, reduced motion, and read-only behavior.

The result uses a MPL/M-Series-inspired navy, metallic silver and gold treatment with angular card edges. Both teams remain visible in blue-left/red-right order; the defeated team is desaturated and dimmed. The result panel is 1920×1080 at (0, 0), with no transparent margins. It remains hidden/transparent when no winner is selected. The vertical tournament rail follows the shared `tournament-title` field from init/update messages (with the LCUAA title as fallback). Game number remains a game label, not a series score.

Open `/matchwinner-control.html` to preview and save background, victory accent, team panel, primary/secondary text and border colors. Colors use the independent `arena/matchwinner` scope in `/api/broadcast-colors`, with revision-guarded saves and live WebSocket updates plus polling recovery. Restart the Node server after installing this change so its shared color model accepts the new output.

Loop effects: a narrow reflection crosses the winning card every seven seconds; the victory label has a six-second light sweep, the winner border softly pulses, and a light travels down the tournament rail. All loops pause when the result is hidden and stop under reduced-motion preference. The defeated card stays static and grey.

The VICTORY light sweep is clipped to the letter shapes; it does not draw a rectangle behind the title. Both team cards use solid palette colors without static diagonal metallic patterns. The moving winner-card reflection remains.
