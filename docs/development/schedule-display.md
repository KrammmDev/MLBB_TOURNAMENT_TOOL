# Schedule / holding frame

`/scheduledisplay.html` is a 1920×1080 broadcast holding frame. In Broadcast Themes select **Schedule / holding screen**, preview Classic/Arena/Studio, then use **Use for Schedule only**. Schedule theme and all six palette fields are independent of other outputs. Existing saved theme files inherit their prior look for Schedule until explicitly changed.

The display consumes the existing `schedule-1` through `schedule-8` data from `schedulecontrol.html` through the server's shared-state init/update/clear messages. It never patches localStorage or sends storage state back to the server. Same-browser storage events remain a read-only fallback, and `/api/schedule` plus schedule_update are supported for the existing API feed. Only checked Show on Display entries appear; pages hold four matches and advance every eight seconds. Classic and Arena keep the configured shared casters image visible while match pages rotate; Studio alternates that image with the schedule in its left panel. Scores, custom match/status text, names and safe logo sources remain live, using plain text for labels.

Timer/label and footer headline come from Production Timer controls; visibility cues for that separate production overlay do not hide the schedule timer. Classic rotates groups of six sponsors from the existing Broadcast Themes playlist with schedule pages in its bottom deck. Arena and Studio keep schedule strips in that deck. The uploaded tournament logo uses the existing scoreboard branding settings; title uses the existing shared tournament-title setting, falling back to MATCH DAY. Existing images, schedules and runtime settings are never overwritten by theme selection.

## OBS video window

Add a video/camera/media source **below** this Browser Source. The window is transparent; this page does not embed or capture the video. On the native canvas:

| Theme   | Video source position | Video size   |
| ------- | --------------------- | ------------ |
| Classic | x=10, y=10            | 1510×849.375 |
| Arena   | x=400, y=10           | 1510×849.375 |
| Studio  | x=10, y=10            | 1510×849.375 |

Classic places four stacked fixtures in a right competition board with talents below the left video and the timer below the fixtures. Arena uses a left talent rail and timer, with two-by-two match strips below the right video. Studio follows the Season 18 format: large tournament masthead and top-right sponsor, schedule/talents alternating in the left panel every eight seconds, a large timer below, video on the right and headline plus seamless ticker below that video. Ticker text and speed come from Production Timer; sponsors use Broadcast Themes uploads. Configure the combined talent image and Show Casters in Schedule Control. Fit the source to the inner border in OBS. Browser previews show checkerboard through the window. Unconfigured logos/sponsors are hidden, and an empty schedule is identified explicitly.

## Validation

`MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/schedule-browser.spec.js` checks live shared-state edits, safe labels, four-slot pagination and talent display, production timer, all three theme geometries, video transparency, panel activation and theme/color isolation. Existing store and other output browser suites cover compatibility. Actual video alignment/branding is verified on the production machine.

## Studio custom palette

Studio uses the supplied metallic-bar CSS with a transparent canvas and no canvas decoration. Panel background controls card/sponsor surfaces; left and right team accents control their side gradients; Borders controls metallic bars and the video frame. Primary text controls scores and the timer; secondary text controls the timer label. Gold gradients derive from the border variable instead of fixed hex colors. Existing saved palettes remain saved; reset the Studio Schedule palette to use the new blue/red/gold defaults.
