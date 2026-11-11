# Theme contract checklist
Proposed contract, not implemented: schemaVersion, themeId, renderer compatibility, asset/font manifest, semantic design tokens, per-output layout adapters, motion timings and fallback theme revision.

Coverage: draft variants, postdraft, scoreboard/manual+OCR, roster, lower third, schedule, group/playoff brackets, winner, MVP and postgame. Mark unsupported outputs explicitly; a recolored draft alone is not complete theme support.

Each output specification records canvas, safe area, alpha behavior, text limits, missing-image fallback, cue lifecycle and performance considerations. Three theme names/art directions remain to be selected; do not invent approved branding. Preserve shared state bindings and test theme changes at idle and during a draft.
