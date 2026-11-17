# Independent production timer

Open `/production-panel.html` for controls and add `/production-timer.html` to OBS as a 1920×1080 Browser Source. The transparent canvas contains a top-left current-match/timer card and a bottom headline/sponsor/ticker banner. Team names, logos and series scores subscribe read-only through MatchDataClient to the current match edited in control.html. Both parts remain in the same Browser Source. Broadcast Themes links to the controls. The timer uses the existing Node launcher, not an OBS Lua/text-source script.

Set Countdown or Countup, duration in seconds, label, format, end text, headline, colors and scrolling text, then save. Start/Resume, Pause and Reset act immediately on the timer only. Reset pauses. Changing mode/duration also resets and pauses; changing colors or ticker preserves the running clock. `%0h`, `%0m`, `%0s` format hours/minutes/seconds; without hours the minutes are total elapsed/remaining minutes. Countdown stops visually on end text. Start on an expired countdown starts a new duration. Refreshing/hiding a Browser Source never resets the timer.

Settings and timing anchors persist in `runtime/production-panel.json`. Clients use server timestamps and monotonic elapsed time between reads. Running timers continue across control-page closure and server restart using their saved timestamp. The server clock should be correct. Revision-guarded serialized writes commit to disk before acknowledgement; corrupt settings are retained and startup reports the error. The panel has its own API (`/api/production-panel`) and never writes match/draft/OCR clocks or data.

Sponsors reuse `SponsorSlideshow` and the existing `/api/broadcast-sponsors` playlist, including animation and logo fallback. Upload/manage logos in Broadcast Themes; changing that playlist also affects its other existing consumers. The panel's Show sponsors toggle affects only this overlay. Scrolling text uses safe plain-text rendering and supports reduced-motion preference. Browser-source visibility does not start/pause the clock; operate it from the panel.

Verification: `node --test test/production-panel.test.js` and `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/production-panel-browser.spec.js`. Actual Windows/OBS playback remains production-machine verification.

Existing saved panel files gain an empty headline field without resetting their timer anchor. Headline is editable plain text (up to 240 characters); sponsor logos remain in a compact slot. Match updates never mutate production timer state.


## Visibility and colors

The compact current-match card is 560×136 on the 1920×1080 canvas. Hide/Show Current Match and Hide/Show Lower Third are independent saved cues with fade/slide transitions in both directions (reduced-motion users get an immediate change). Hiding never pauses or resets the clock; refresh retains visibility without flashing the hidden panels. Current-match background/text and the shared accent have their existing controls. Lower third background, headline text, scrolling strip background/text and sponsor slot background each have dedicated color controls. Legacy settings inherit their saved background/text for the new fields, with a white sponsor slot, and retain their timing anchors.


## Roster timer display

Roster outputs (Classic, Arena and Studio, including legacy URLs) also display the acknowledged production timer and its label. They follow the same Start/Pause/Reset, format and end text from Production Timer controls. The Roster timer remains visible even when Current Match or Lower Third is hidden in the production overlay. If the production-timer API is unavailable before the first acknowledged read, the original roster countdown-target remains the compatibility fallback. No match/draft clock is written.

The ticker fills at least one viewport with safe repeated text, duplicates that group, and translates by exactly one group width per cycle. This keeps the wrap seamless for short and long text without a viewport-sized blank reset. Colors, timer polling and panel visibility cues do not restart the ticker. Reduced-motion mode shows one static readable copy.
