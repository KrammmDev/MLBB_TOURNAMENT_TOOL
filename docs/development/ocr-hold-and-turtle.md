# OCR operator behavior — last valid values, global score, Turtle toggle

## Last validated value
- While a **custom OCR live session** remains active and the match context is unchanged, the scoreboard continues displaying its last **accepted** reading for each field if a later frame is unreadable, below confidence threshold or rejected as an implausible change.
- This is **session memory**, not a new saved result file. A new game, new OCR session, stopping OCR, or failed/disconnected capture resets it. A browser that cannot contact the server still blanks after its connection freshness timeout. Before the first accepted reading, unknown remains `--`.
- The OCR Control status marks older values as `stale` and its reason indicates that the last accepted value is held. The game timer does not tick forward without validated OCR input.

## Global engine score
- The OCR Control calibration sidebar has one **Global minimum engine score** setting (50–100), persisted to the existing OCR configuration file and used by all calibrated fields.
- This does not alter individual preprocessing methods, crop geometry, original per-region values saved for compatibility, or manual Lock/Auto overrides.
- Changing the threshold intentionally stops the current OCR session; start Preview again to verify before taking it Live.
- The global default on upgrading an existing OCR config without this setting is 85; adjust it in the control panel if needed. Do not lower the score simply to mask unreadable crops.

## Turtle display
- **Show Turtle icons on scoreboard** is an opt-in persisted switch in OCR Control.
- The Turtle markers already present beside team kill-score are shown/hidden without moving score elements or changing OBS URLs or match data. The count still comes from existing match/team metadata (`team.turtles` / `team.turtle`), **not** from OCR reading the on-screen Turtle icon.
- When off, the existing plain scoreboard layout is preserved. Turning on/off applies to open overlay clients via OCR state updates.

## Testing
- `npm run test:ocr` includes new cases for held values, global threshold and Turtle configuration.
- `npm run test:browser` includes Turtle visibility checks in OCR browser regression.
- Test a real capture where OCR temporarily returns blank for one team while previous accepted values exist. Confirm the overlay stays on the previous value, and new game/stop clears them.
