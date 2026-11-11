---
name: mlbb-competition-systems
description: "Implement or repair MLBB draft phases, bans and picks, corrections, side swaps, match and series results, tournament brackets, standings, hero statistics or imports."
---

## Purpose and boundaries
Own legal competition transitions and metric definitions independently of themes, DOM IDs, transport and OCR engines. Use mlbb-broadcast-core for command delivery and persistence.

## Entry points
Read ../../../docs/development/project-context.md. Inspect public/script/herodropdown.js and herodropdownban6.js, public/controller.html, public/control.html, public/postgamecontrol.html and relevant server.js routes. Do not infer a format solely from a filename; inspect its actual rules.

## Workflow
1. Write the rule or invariant being changed, its current behavior and intended behavior. Read references/rules.md for the required rule inventory.
2. Use stable tournament/team/series/game IDs; blue/red are side assignments, not permanent team identities. Reset creates a new game identity or generation so late OCR readings cannot modify the next game.
3. Represent draft variants as explicit phase configurations: acting side, pick/ban action, slot count, duration and transition requirements. Validate hero uniqueness and format-specific restrictions on the authoritative path.
4. Specify pause/resume, correction, swap, reset and incomplete multi-pick behavior. Preserve identity when presentation order changes.
5. Make result recording idempotent per game. Define how corrections reverse or recompute affected statistics and downstream bracket advancement.
6. Cover byes, ties, manual ranking, disqualification policy if supported, lower-bracket propagation and grand-final reset according to the selected format. Do not silently invent event rules.
7. Define pick/ban/win-rate denominators explicitly. Existing server code uses total picks for pick and ban rates; label this as current behavior rather than an approved esports metric.
8. Validate CSV names, quoted fields, finite nonnegative counts and wins versus picks. Make additive imports deliberate and traceable; retries must not silently duplicate imports.
9. OCR may propose observed values. It must not independently record a winner, advance a bracket, count a game or infer draft selections from an unverified reading.

## Verify
Use pure rule fixtures for phase progression, corrections, side swaps, BO formats, repeat results, bracket byes/reset and import retries. Combine with real UI scenarios only where wiring matters. Document unsupported rules rather than claiming tournament compliance.
