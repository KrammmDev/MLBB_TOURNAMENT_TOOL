# Schedule / holding frame

`/scheduledisplay.html` is a 1920×1080 broadcast holding frame. In Broadcast Themes select **Schedule / holding screen**, preview Classic/Arena/Studio, then use **Use for Schedule only**. Schedule theme and all six palette fields are independent of other outputs. Existing saved theme files inherit their prior look for Schedule until explicitly changed.

The display consumes the existing `schedule-1` through `schedule-8` data from `schedulecontrol.html` through the server's shared-state init/update/clear messages. It never patches localStorage or sends storage state back to the server. Same-browser storage events remain a read-only fallback, and `/api/schedule` plus schedule_update are supported for the existing API feed. Only checked Show on Display entries appear; pages hold four matches and advance every eight seconds. The configured shared casters image adds a casters page after the matches. Scores, custom match/status text, names and safe logo sources remain live, using plain text for labels.

Timer/label and footer headline come from Production Timer controls; visibility cues for that separate production overlay do not hide the schedule timer. Sponsors use the existing Broadcast Themes playlist. The uploaded tournament logo uses the existing scoreboard branding settings; title uses the existing shared tournament-title setting, falling back to MATCH DAY. Existing images, schedules and runtime settings are never overwritten by theme selection.

## OBS video window

Add a video/camera/media source **below** this Browser Source. The window is transparent; this page does not embed or capture the video. On the native canvas:

| Theme | Video source position | Video size |
| --- | --- | --- |
| Classic | x=40, y=40 | 1280×720 |
| Arena | x=40, y=40 | 1120×630 |
| Studio | x=640, y=220 | 1240×697.5 |

Classic uses an ember competition rail on the right and a lower clock deck. Arena places a two-column match grid below the left video, with an event/timer/sponsor tower on the right. Studio uses a large editorial masthead, left matchup wedges and right video canvas. Fit the source to the inner border in OBS. Browser previews show checkerboard through the window. Unconfigured logos/sponsors are hidden, and an empty schedule is identified explicitly.

## Validation

`MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/schedule-browser.spec.js` checks live shared-state edits, safe labels, four-slot pagination/casters rotation, production timer, all three theme geometries, video transparency, panel activation and theme/color isolation. Existing store and other output browser suites cover compatibility. Actual video alignment/branding is verified on the production machine.
