# Control-panel migration — phase 2

## Operator-visible changes
The normal panel at `/control.html` and 6-ban panel at `/controlban6.html` now share connection/save feedback and a Reload latest match action after a conflict or failed save. Existing layouts, buttons and draft sequences remain in place.

Only edited match fields are sent. Names, lanes, logos, score/format/winner, labels/title and hero/ban mirrors no longer submit a complete match document. Team-name aliases are saved together. A failed score save does not trigger the normal panel's existing hero-stat recording. A failed hero/ban mirror does not advance the draft. Per-element autosave timers avoid one team's typing cancelling the other team's save.

## Try it
After pulling main, stop the old server and start with the existing launcher or `npm start`. Open a control panel and `/postgamecontrol.html` in separate tabs. Change unrelated fields, verify both persist, then deliberately edit the same field from stale tabs. The rejected edit should show Not saved; Reload latest match asks before discarding local edits. Avoid conducting this check during a live production match.

The nickname switch still swaps the naming/identity presentation fields, logos and scores rather than all game statistics. Full team names now travel with that nickname switch. Objective counters retain their existing distinct `turtles` and `turtle` fields; these have not been silently merged. Format changes reset series scores in the same batch. No new match-result or bracket rules were introduced.

## Development checks
- `npm test`: existing store, HTTP and startup regression checks.
- `npm run test:browser`: existing two-tab postgame scenario plus real normal/6-ban panels with concurrent postgame edits, both teams' debounced saves, pending manual title, numeric score arithmetic, failed score saves, nickname switching, successful/failed draft mirrors, same-field conflict/reload, reset-before-debounce, socket recovery and initial server-outage recovery.
- `MLBB_TEST_BROWSER` can select an installed Chromium executable. Otherwise install Playwright Chromium as documented in state-foundation.md.

The browser fixtures use isolated in-memory match/draft state, substituted images and synthetic failure injection; they do not edit the repository's match database. Assertions also verify zero full-document match POSTs from migrated panels. Real Windows/OBS behavior and final graphics appearance still need target-machine verification.

## Remaining work
The draft state API, timer authority, shared browser-storage mirror, tournament/schedule/theme/MVP/archive persistence and unconditional external compatibility POST callers are outside this migration. Match and draft saves are not an atomic transaction. Stable game/team IDs and result-recording idempotency remain future work. OCR is on hold. Shared overlay rendering and theme contracts are next architectural work before the three visual themes.

Skills applied: mlbb-broadcast-core, mlbb-production-workflows, mlbb-production-validation and mlbb-competition-systems.
