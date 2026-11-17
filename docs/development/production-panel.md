# Independent production timer

Open `/production-panel.html` for controls and add `/production-timer.html` to OBS as a 1920×1080 Browser Source. The transparent canvas contains a bottom timer/sponsor/ticker panel. Broadcast Themes links to the controls. The timer uses the existing Node launcher, not an OBS Lua/text-source script.

Set Countdown or Countup, duration in seconds, label, format, end text, colors and scrolling text, then save. Start/Resume, Pause and Reset act immediately on the timer only. Reset pauses. Changing mode/duration also resets and pauses; changing colors or ticker preserves the running clock. `%0h`, `%0m`, `%0s` format hours/minutes/seconds; without hours the minutes are total elapsed/remaining minutes. Countdown stops visually on end text. Start on an expired countdown starts a new duration. Refreshing/hiding a Browser Source never resets the timer.

Settings and timing anchors persist in `runtime/production-panel.json`. Clients use server timestamps and monotonic elapsed time between reads. Running timers continue across control-page closure and server restart using their saved timestamp. The server clock should be correct. Revision-guarded serialized writes commit to disk before acknowledgement; corrupt settings are retained and startup reports the error. The panel has its own API (`/api/production-panel`) and never writes match/draft/OCR clocks or data.

Sponsors reuse `SponsorSlideshow` and the existing `/api/broadcast-sponsors` playlist, including animation and logo fallback. Upload/manage logos in Broadcast Themes; changing that playlist also affects its other existing consumers. The panel's Show sponsors toggle affects only this overlay. Scrolling text uses safe plain-text rendering and supports reduced-motion preference. Browser-source visibility does not start/pause the clock; operate it from the panel.

Verification: `node --test test/production-panel.test.js` and `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/production-panel-browser.spec.js`. Actual Windows/OBS playback remains production-machine verification.
