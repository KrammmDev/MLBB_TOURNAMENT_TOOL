# Broadcast state foundation — phase 1

## What changed
The postgame editor now saves only changed fields. Two operators can update unrelated fields without replacing each other's complete documents. A same-field/context conflict displays a failed-save message and offers an explicit reload that discards local edits. SAVED means the server has completed its atomic file replacement.

Existing match GET body, JSON storage format, overlay URLs and the two legacy match event shapes remain compatible. The match API modules are now separate from server.js. Cache loading completes before the server starts accepting traffic.

## Run and verify
Use the existing Windows launcher or `npm start`; port 3000 remains the default. `PORT` may override it for isolated development. Use `npm ci` for a clean dependency install; no new dependency is added in this phase.

- `npm test`: match-store concurrency, atomic persistence, conflict/failure recovery, HTTP compatibility and actual server startup against isolated temporary fixtures.
- `npm run test:browser`: two real browser tabs covering postgame edits, focus protection, conflict/reload, socket reconnect and failed saves. Install Playwright's Chromium with `npx playwright install chromium` if needed, or set `MLBB_TEST_BROWSER` to an installed Chromium executable.

Tests use temporary/synthetic state and do not alter the production database. Browser fixture images are substituted; this test does not certify final graphics, font rendering or OBS behavior.

## Operator recovery
If the editor reports that another panel changed the match, the conflicted batch was not applied. Keep any needed local values, then choose Reload latest match and confirm discard before re-entering them. If a network failure happened after a committed write, reload shows the actual result; do not blindly repeat a write. A storage error leaves the last committed match in memory. Check disk permissions/free space and reload before retrying.

If startup says Cannot load match data safely, preserve `public/database/matchdatateam.json` and restore a valid backup or repair it. The server does not silently overwrite it with defaults. Close old server instances before starting this version.

## Scope and next work
Skills used: Broadcast Core, Production Validation and Production Workflows. No competition format/result semantics, OCR, graphics redesign or additional themes were implemented. Next migrate the remaining control panels to field patches and stable match/team identities, then extract shared overlay/theme behavior. Unmigrated POST callers remain a documented concurrency limitation.

## Verification performed
On Node 24 in Linux: 12 Node tests passed, including actual server startup and preservation of a corrupt saved file; the Playwright Chromium two-tab scenario passed; JavaScript syntax checks and git diff whitespace checks passed. No new dependency or lockfile change was needed. Actual Windows file-replacement behavior and OBS rendering remain unverified on the target production machine.
