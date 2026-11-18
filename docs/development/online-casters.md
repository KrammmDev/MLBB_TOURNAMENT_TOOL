# Online Casters broadcast

Open **Broadcast Theme → Output → Online Casters** to preview and select three designs independently of other outputs:

- Classic: dark championship desk with centered gold nameplates.
- Arena: electric blue frame with angular mirrored white nameplates.
- Studio: light red/white frame with side role tabs.

The theme-picker iframe shows a design preview even while the live frame is hidden, with sample names when fields are empty. Previewing never changes live visibility.

The **Online Casters** section below the preview has two name/handle/role editors. Save details, then use **Show frame / Hide frame** and **Show names / Hide names**. Names slide/fade in; updates to visible text do not replay the animation. Reduced-motion preference removes transitions. Frame controls affect the browser graphic only; external OBS cameras remain separate sources.

Use `/casters.html` as an OBS Browser Source at **1920 × 1080** and place both camera/browser captures underneath. Crop each capture to **840 × 560**; left position **X90/Y230**, right **X990/Y230**. Both camera windows are transparent and keep their coordinates across all three looks. Hub → Display Overlay → Online Casters opens the source. The header uses the existing tournament-title setting.

Colors use the existing six-field editor and independent theme/casters palettes. Theme selections use the existing broadcast-theme store. Camera video is never fetched by this overlay. It does not copy event logos or sponsor branding from the references.

Caster details and visibility persist in `runtime/caster-panel.json` through `/api/caster-panel`. Saves are revision-guarded and serialized; invalid, stale or failed writes preserve the acknowledged snapshot. Live changes broadcast as `caster_panel_update`, with polling recovery and no overlay writes. Initial frame visibility is hidden.

Restart the Node server after installing to register the new routes/output. No runtime settings or user images are included in the change.

Validation: `MLBB_TEST_BROWSER=/usr/bin/chromium node --test test/caster-panel.test.js test/casters-browser.spec.js test/roster-theme.test.js test/broadcast-colors.test.js` covers persistence, stale/invalid/failed writes, all three designs, real Broadcast Theme controls, transparency, live names, show/hide, reduced motion, independent theme/colors and no overlay state writes.
