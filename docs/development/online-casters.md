# Online Casters broadcast

Open **Broadcast Theme → Output → Online Casters** to preview and select three designs independently of other outputs:

- Classic: dark championship desk with centered gold nameplates.
- Arena: electric blue frame with angular mirrored white nameplates.
- Studio: violet-to-lavender event backdrop, gold 16:9 camera frames, centered tournament logo and inset purple name tabs.

The theme-picker iframe shows a design preview even while the live frame is hidden, with sample names when fields are empty. Previewing never changes live visibility.

The **Online Casters** section below the preview has two name/handle/role editors. Save details, then use **Show frame / Hide frame** and **Show names / Hide names**. Names slide/fade in; updates to visible text do not replay the animation. Reduced-motion preference removes transitions. With embedded VDO feeds, Hide frame immediately mutes both receivers through VDO.Ninja’s iframe API and keeps their documents connected; Show frame unmutes them without reconnecting. Show/Hide names affects nameplates only; it does not disconnect audio. External OBS camera/audio sources remain separate and are not controlled by these buttons.

Use `/casters.html` as an OBS Browser Source at **1920 × 1080** and place both camera/browser captures underneath. Crop each capture to **840 × 560**; left position **X90/Y230**, right **X990/Y230**. Both camera windows are transparent. Classic and Arena use the coordinates above; Studio uses 840 × 472.5 windows at X90/Y340 and X990/Y340, with inset name tabs. Hub → Display Overlay → Online Casters opens the source. The header uses the existing tournament-title setting.

Colors use the existing six-field editor and independent theme/casters palettes. Theme selections use the existing broadcast-theme store. VDO.Ninja video/audio can be received directly in the overlay. It does not copy event logos or sponsor branding from the references.

Caster details and visibility persist in `runtime/caster-panel.json` through `/api/caster-panel`. Saves are revision-guarded and serialized; invalid, stale or failed writes preserve the acknowledged snapshot. Live changes broadcast as `caster_panel_update`, with polling recovery and no overlay writes. Initial frame visibility is hidden.

Restart the Node server after installing to register the new routes/output. No runtime settings or user images are included in the change.

Validation: `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/caster-panel.test.js test/casters-browser.spec.js test/roster-theme.test.js test/broadcast-colors.test.js` covers persistence, stale/invalid/failed writes, all three designs, real Broadcast Theme controls, transparency, live names, show/hide, reduced motion, independent theme/colors and no overlay state writes.

## VDO.Ninja and individual On Air controls

Paste each caster's **receive/view link** (`https://vdo.ninja/?view=...`) in their VDO.Ninja field and save details. Room-qualified receive links such as `?view=...&solo=1&room=...` are supported. Push links, room-only links without a view ID, and non-VDO hosts are rejected. The overlay embeds each active feed with autoplay permission; enable **Control audio via OBS** on the Browser Source. Use this embedded source for caster audio so the On Air controls own its lifecycle.

Each caster has **On Air / Off Air** buttons. Off Air slides that camera and nameplate out, then removes its iframe after 650ms (immediately with reduced motion), destroying its audio/video document. One remaining caster moves to a centered 1200×560 window at X360/Y230. Returning On Air recreates the feed and restores the duo layout. Both off-air leaves no active feeds. Hide frame keeps existing feeds connected and mutes them; hiding only names keeps audio/video running. Saved legacy settings default both casters to on-air with blank view links, preserving external-camera mode.

Broadcast Theme previews never load VDO embeds, avoiding duplicate audio. Browser tests use a stubbed VDO receiver to verify iframe removal/recreation and solo geometry; actual VDO media playback still depends on the supplied live view link and OBS audio settings.

Show frame, Show names and On Air save current edited details with their action, avoiding blank names or stale view links when a separate Save was missed. Stop actions (Off Air, Hide frame, Hide names) use acknowledged settings so invalid unsaved input cannot prevent taking a feed off-air. Invalid view links identify the caster in the error message.

Caster entry/exit and duo/solo changes use 650ms compositor transform/opacity animations with a shared easing curve. Geometry is measured before each layout change so interrupted moves continue from the visible position. The VDO document remains attached during its exit and is removed at the matching end time; reduced motion disconnects immediately.

The broadcast designs use stronger camera edging, tournament header plates and mirrored tournament-logo nameplate blocks inspired by the supplied esports references. Arena uses white/cyan angular lower thirds, Classic uses dark/gold championship plates, and Studio uses violet event framing, gold borders, the tournament logo above the cameras and purple inset name tabs. Studio has its own 16:9 camera geometry; solo behavior and VDO controls remain available.

VDO receiver URLs are preserved as supplied (after URL validation), including view/solo/room/password options. The overlay no longer injects autostart or cleanoutput, so it loads the same receiver address that was verified in a standalone tab. Autoplay permission remains on the iframe. A working direct link is required; the change does not establish the cause of every live WebRTC connection failure.

Both nameplate logo tiles use the existing Broadcast Theme → Tournament logo upload (`logoFile` in scoreboard branding). They load initially, update on scoreboard_branding_update and recover through five-second polling. Removing the logo clears both tiles; missing/broken images hide without an MLBB text fallback. Saved caster details and view links are unchanged.

## Draft below casters

Broadcast Theme's Online Casters controls include **Show draft** and **Hide draft**. This independently saves `draftVisible` in the caster panel (old settings default to false). Show draft moves/scales both camera windows and nameplates above an embedded `/draft-display.html?audio=0`; Hide draft restores the normal desk. The embedded renderer follows its own saved Draft theme, colors, match data, picks, bans and timer. Use `/casters.html?format=six` for the six-ban draft.

The draft iframe mounts once on first show and remains live when hidden. Draft audio is disabled. Caster VDO receiver documents remain mounted during layout transitions; Off Air still disconnects the receiver, while Hide frame keeps it connected and muted. In solo mode, the remaining caster centers above draft. Reduced motion switches layouts immediately. Separate OBS camera captures are not repositioned automatically; use embedded VDO feeds for this combined layout.

Hide frame never starts a new receiver while hidden. URL changes while hidden remove the old receiver; the new one starts on Show frame. Initial hidden outputs and theme previews do not preload receivers. Mute state is sent to the exact `https://vdo.ninja` origin on visibility changes, receiver load and two initialization retries, using the latest acknowledged state. A first connection or return from Off Air still needs VDO signaling; browser autoplay permissions still apply.

Studio’s default palette is violet/gold. Existing saved custom palettes are preserved; use **Reset to default**, then **Save colors**, with Studio / Online Casters selected to apply the new default palette. The header uses the same tournament-logo upload; no event logo from the reference is bundled. Studio name tabs show caster names; handles and roles remain saved for the other looks.
