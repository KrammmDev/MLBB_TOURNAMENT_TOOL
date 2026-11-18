# Schedule / holding frame

`/scheduledisplay.html` is a 1920×1080 broadcast holding frame. In Broadcast Themes select **Schedule / holding screen**, preview Classic/Arena/Studio, then use **Use for Schedule only**. Schedule theme and all six palette fields are independent of other outputs. Existing saved theme files inherit their prior look for Schedule until explicitly changed.

The display consumes the existing `schedule-1` through `schedule-8` data from `schedulecontrol.html` through the server's shared-state init/update/clear messages. It never patches localStorage or sends storage state back to the server. Same-browser storage events remain a read-only fallback, and `/api/schedule` plus schedule_update are supported for the existing API feed. Only checked Show on Display entries appear; pages hold three matches in Arena/Classic or four in Studio, with eight-second holds plus transition time. Arena keeps the configured shared casters image visible while match pages rotate; Classic alternates the left schedule deck with a CASTERS panel; Studio alternates that image with the schedule in its left panel. Scores, custom match/status text, names and safe logo sources remain live, using plain text for labels.

Timer/label and footer headline come from Production Timer controls; visibility cues for that separate production overlay do not hide the schedule timer. Sponsors from Broadcast Themes rotate in the dedicated sponsor slot. Classic alternates schedule pages with the CASTERS panel using Schedule Control’s combined image and Show Casters checkbox. The uploaded tournament logo uses the existing scoreboard branding settings; title uses the existing shared tournament-title setting, falling back to MATCH DAY. Existing images, schedules and runtime settings are never overwritten by theme selection.

## OBS video window

Add a video/camera/media source **below** this Browser Source. The window is transparent; this page does not embed or capture the video. On the native canvas:

| Theme   | Video source position | Video size   |
| ------- | --------------------- | ------------ |
| Classic | x=10, y=10            | 1510×849.375 |
| Arena   | x=400, y=10           | 1510×849.375 |
| Studio  | x=10, y=10            | 1510×849.375 |

Classic uses three stacked left fixtures and a right video. Arena uses a right-aligned video, a wider left caster area and a three-match bottom ribbon. Studio follows the Season 18 format: large tournament masthead and top-right sponsor, schedule/talents alternating in the left panel every eight seconds, a large timer below, video on the right and headline plus seamless ticker below that video. Ticker text and speed come from Production Timer; sponsors use Broadcast Themes uploads. Configure the combined talent image and Show Casters in Schedule Control. Fit the source to the inner border in OBS. Browser previews show checkerboard through the window. Unconfigured logos/sponsors are hidden, and an empty schedule is identified explicitly.

## Validation

`MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/schedule-browser.spec.js` checks live shared-state edits, safe labels, four-slot pagination and talent display, production timer, all three theme geometries, video transparency, panel activation and theme/color isolation. Existing store and other output browser suites cover compatibility. Actual video alignment/branding is verified on the production machine.

## Studio custom palette

Studio uses the supplied metallic-bar CSS with a transparent canvas and no canvas decoration. Panel background controls card/sponsor surfaces; left and right team accents control their side gradients; Borders controls metallic bars and the video frame. Primary text controls scores and the timer; secondary text controls the timer label. Gold gradients derive from the border variable instead of fixed hex colors. Existing saved palettes remain saved; reset the Studio Schedule palette to use the new blue/red/gold defaults.

## Schedule slideshow motion

Pages hold for eight seconds between transitions. Each transition pans the outgoing panel left over 450ms, swaps the page, then pans the next panel in from the right over 450ms. Only the schedule/talent deck moves; the video, clock and branding stay fixed. Live data edits cancel an in-progress pan and render immediately. Reduced-motion mode swaps without animation. Adjust PAGE_HOLD_MS and PAN_MS in schedule-renderer.js to change the hold and transition durations.

Match cards pan individually in order with a 200ms stagger. TODAY’S SCHEDULE stays stationary when switching between match pages; it only joins the transition when switching to another panel such as talents or partners. The cycle reserves the full stagger duration plus an eight-second hold.

## Arena and Classic reference formats

Arena uses a championship header with a top-right clock, right-aligned video opening, three-match bottom ribbon and bottom-right shared sponsor. Classic uses an oversized playoffs title/clock, three stacked left fixtures, right video and lower sponsor/headline panels. Both canvases are transparent without decorative scenery or full-stage paint. Colored panels remain visible and follow the six palette fields. Studio keeps its existing custom layout. Arena/Classic paginate three matches; Studio paginates four. Classic alternates its left fixtures with the configured CASTERS image; Arena keeps an optional narrow talent slot beside the video.

Classic uses square corners across fixtures, video frame, sponsor slot and lower panels. Beneath the video, a metallic headline band (y950, height56) and a separate seamless scrolling strip (y1017, height38) share the video’s x730/width1140 alignment. Both use the existing Production Timer headline/ticker settings and Schedule palette. The stage remains transparent.

Classic retains its original horizontal logo/name–score–name/logo arrangement and light panel. Enhancements are limited to a softer panel tint and subtle card separation; square corners, metallic match bars, transparent canvas and existing geometry remain intact.

Classic fixture tiles now use dark surfaces, vertical team logos/names at each end, a large central score, match label above and BO format below. BO labels are extracted from the existing match/status text when present; no series format is invented. Subtle watermarks reuse safe team logo sources. Card accents use the team palette fields and the label uses Borders. Card text gets readable contrast on the dark surface. The canvas stays transparent.

Arena now uses a metallic broadcast-desk finish: silver surfaces with palette-driven blue/side accents, fine bevel highlights, square corners, a 620px left caster area and a right-aligned video opening with a 20px margin. Header, timer, fixture ribbon and sponsor slot share this surface treatment. The video and stage remain transparent. The footer follows the video at x680/width1220. Existing geometry/feeds for Classic and Studio are retained.

Arena hides the separate headline band. Its schedule and sponsor row starts at y890 (145px tall); a full-width seamless ticker runs below at x20/y1043, width1880 and height27, spanning TODAY’S SCHEDULE through the sponsor slot. Text and duration come from the existing Production Timer ticker settings. Classic and Studio keep their headline bands.

Arena’s metallic panels include a narrow reflection that sweeps across each panel on a six-second loop, with offset phases. Only the reflection moves; it is clipped inside each panel, behind text/logos, and does not affect the video opening, card pan transitions or ticker. Reduced-motion preference disables the reflection.

Arena’s base panel surfaces are now flat palette colors, removing the stationary diagonal sheen. The moving reflection is retained. Arena cards enter upward from below, staggered by 200ms, including initial display; page changes also exit upward. The heading stays still between match pages. Classic and Studio retain horizontal card transitions.

Arena bundles Google Fonts’ Russo One (display headings) and Oxanium (geometric team names, metadata and tabular clock/score numbers) under public/fonts/arena, with each SIL OFL license. These are alternatives matching the requested geometric/esports style, not the exact screenshot fonts. Local WOFF2 files avoid a runtime font-CDN dependency. Font sources: https://fonts.google.com/specimen/Russo+One and https://fonts.google.com/specimen/Oxanium.
