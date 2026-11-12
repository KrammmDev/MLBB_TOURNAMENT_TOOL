# Shared draft output — phase 4

## Operator workflow
Open `/broadcast-themes.html`, choose Draft or Draft · 6 bans under Output, and preview a preset. Use for roster + draft outputs saves the shared selection for the **new** roster and draft Browser Sources. Merely changing the preview/output selector does not change draft rules or publish a theme.

OBS Browser Source URLs, both at 1920×1080:

- `/draft-display.html` or `/draft-display.html?format=normal`: normal controller's draft order.
- `/draft-display.html?format=six`: the 6-ban controller's order.
- Append `&theme=studio` (or `?theme=studio` without other query parameters) to pin a preview instead of following the saved selection.

Use the URL matching the controller actually in use. Format selection is explicit because the existing draft document does not identify its format. A display never advances phases, switches sides, selects heroes or changes controller rules.

The new shared draft layout has team names/logos, series win pips, hero cards, player names, lane icons, active pick/ban outlines, phase, remaining seconds and optional entered match/game labels. Studio is the initial restrained style; Classic and Arena supply warm and gold-edged color treatments of the same layout. This does not claim three distinct complete broadcast packages.

## No authored branding
Do not add decorative league/game names, slogans, watermarks, dummy match titles, placeholder hero names or default footer copy to broadcast scenes. This is a current user requirement. The draft scene shows actual input data and functional phase/clock indications only. Names remain blank when unknown rather than displaying Unknown or a fabricated title.

Automatic roster title/footer defaults and the Arena edge slogan were removed too. Explicit operator-entered branding/data remains configurable and is not censored. An unconfigured countdown is hidden. Operator controls retain useful navigation and action labels; the no-branding requirement concerns the broadcast graphic, not removal of necessary controls.

## Legacy displays
`display2.html` and `display2ban6.html` retain their existing CSS geometry while using the same model/renderer. Duplicate hidden IDs and the overlapping hero/name/lane/score scripts were removed from these primary pages. Normal display hero-stat cards remain available through their existing module. The archived `displayban6.html` also loads the compatibility renderer while retaining its pre-existing markup/style reference; it is not a redesigned or visually certified output.

New output audio is off by default; `audio=1` opts into hero voices. Legacy entry points retain voice support and accept `audio=0` to disable it. Existing selections are not replayed on initial snapshot/reconnect; later changed selections may play a voice if present and browser autoplay permits. No audio-unlock button is placed on the broadcast image.

## Shared implementation and recovery
`draft-model.js` contains only display mappings and normalization. Unit tests compare every real phase's active box list directly with each existing controller array, including the 6-ban array's actual order rather than its inconsistent numeric annotation fields. Adjustment is display-only and highlights no pick/ban slots.

`draft-renderer.js` consumes match snapshots through the shared client and listens for draft snapshots/ticks on that same socket. It uses current snapshots on reconnect and bounded polling as recovery; it does not reload the whole page. Malformed full draft snapshots are ignored so a partial message cannot erase a valid display. Metadata and image fallbacks do not print fabricated hero names. CSS theme replacement retains hero DOM and current data.

`mirrorDraftTimer` updates only validated timer/running values in the server's in-memory draft cache when a live tick arrives. This makes subsequent REST/reconnect reads current, including zero. It cannot change phase or hero selections and adds no per-tick **draft-file** write. The existing generic shared-state mirror may still persist messages; this phase does not redesign that mechanism. Restart recovery still begins from the last full persisted draft, not a durable clock event log. Clock authority remains with the existing controller; displays do not count down independently.

Pause keeps the last remaining fraction visible. Zero renders 00 with zero fill rather than falling through to a 50/60 default. Late HTTP snapshots cannot overwrite newer full events; fresh ticks can update a pending read's clock without replacing its selections.

## Theme protocol compatibility
The catalog now advertises roster and draft coverage with `draftStyles`. `/api/broadcast-themes` and `/api/broadcast-theme` are aliases over the same catalog/store as the earlier roster endpoints; the existing runtime filename and revision guard remain compatible. No second selection authority was introduced. The legacy `roster_theme_update` topic continues to carry the shared selection. Generic `BroadcastThemeClient` readiness messages include output and draft format; roster readiness aliases remain for old consumers.

A stylesheet failure retains the last loaded look; cross-source activation remains best effort, not an all-source barrier or proof of OBS on-air state. Other graphics and legacy `/api/theme` remain separate. OCR is still on hold.

## Verification
`npm test` covers existing state/store/HTTP tests, controller-order parity, clock-zero normalization, timer mirror restrictions and unique active IDs in primary legacy pages. The actual server fixture checks that a live zero tick appears in REST without overwriting phase or writing that tick into the saved draft file.

`npm run test:browser` adds normal/6-ban themed and legacy displays, live zero/phase changes, read-only operation, theme preview/activation, retained hero DOM, malformed snapshots, reconnect, corrections/reset and absence of authored branding. Synthetic artwork is used for layout review; actual Windows/OBS rendering, audio behavior and source-frame performance remain target-machine checks.

## Reference-layout correction

New draft outputs now import the `.mainbox` and `.phasebox` from the existing `display2.html` without executing its scripts. Classic loads the original `display2.css`; its slot, coach, logo, score and center geometry is compared with the original page in the browser scenario. Studio uses the white/gold composition; Arena uses the blue/cyan composition with vertical player names. Both restyle the same complete markup. The six-ban output removes only ban slots 4/5 per side; it retains coach, lane, player-image, hero-stat and match bindings. The original output files stay intact.

Hero statistics initialization handles both static and asynchronously mounted templates. Optional Google Fonts import failures retain the already loaded outer stylesheet and its fallback fonts. Synthetic screenshots establish layout and binding behavior; exact final typography and OBS rendering still require checking with the user's real assets and fonts.
