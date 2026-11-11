---
name: mlbb-broadcast-design-system
description: "Design or implement MLBB broadcast graphics, shared overlay rendering, typography, motion, assets or any of the three interchangeable broadcast themes."
---

## Purpose and boundaries
Own viewer-facing composition and the theme contract. Themes consume shared state and never own competition rules or duplicate API/data-binding code. Operator controls belong to mlbb-production-workflows; OBS runtime setup belongs to mlbb-broadcast-integrations.

## Entry points
Inspect public/script/theme-loader.js, server.js theme routes, public/Assets/costum/Theme/, display2.html/css, overlay-display*.html/js/css and the affected output. Confirm which pages actually load the shared theme loader.

## Workflow
1. Read ../../../docs/development/project-context.md and references/theme-contract.md. Inventory every required output before designing a theme.
2. Define a versioned theme manifest with stable ID, compatible renderer version, typography, semantic colors, layout/motion configuration and asset references. Three themes share one data model and behavior layer; layout adapters may differ.
3. Establish canvas dimensions and safe areas per output. Use the existing 1920x1080 overlay stage as a starting point, not proof every overlay has the same dimensions.
4. Specify information hierarchy, text-fit policy, team-side cues, contrast, alpha edges, font fallback and logo handling. Test long Filipino/English team and player names and missing images.
5. Specify entry/hold/exit timing, interruptions, cue replay and reduced-cost motion. Avoid animating expensive blur/glow over large regions without measurement.
6. Preload and validate theme assets. Activate a theme revision coherently across outputs with a retained previous theme for rollback; define the policy for a disconnected source. A switch must not reset match or draft state.
7. Build original graphics using MPL-inspired readability, consistency and timing; do not assume rights to league art or claim official affiliation.
8. Preserve existing overlay URLs or supply compatibility adapters. Extract duplicated overlay behavior gradually; do not create a third copy of match-fetch logic for a third theme.

## Verify
Use the same fixture and state revision for all three themes. Check draft, scoreboard, roster, lower third, schedule, bracket, winner, MVP and postgame coverage. Compare screenshots and transitions; validate transparency and source lifecycle in actual OBS through the integrations skill. Synthetic assets establish layout, not final brand approval.
