# MLBB Screenshot Recognition (Draft)

This first-stage feature tests item/spell image recognition using **an uploaded screenshot**. It is not yet an OBS Virtual Camera or live ADB reader. It does not replace existing OCR or directly edit `public/database/matchdatateam.json`.

## Installation on Windows

1. Pull the feature branch **only for testing** or wait until the PR is approved and merged to main.
2. From `D:\MLBB_TOURNAMENT_TOOL`, run `npm install sharp` once. This installs the new recognition dependency and locally updates package files. Commit package lock changes separately when the dependency is finalized.
3. Verify your image files exist in `public/Assets/Itemandspell/`, with filenames and extensions matching `public/database/item-mappings.json` and `spell-mappings.json`. The PNG references are **not** bundled in the PR.
4. Run `npm test` then `node server.js`.
5. On the same PC as the Node server, open `http://localhost:3000/build-recognition-test.html` and **select the MLBB equipment screenshot** previously shared. This PR does not store the screenshot in the repository.
6. Click **Scan Screenshot**. Review the per-player icons and similarity scores. Confirmed matches enable **Apply to Builds**. Open `http://localhost:3000/builds.html` to see the overlays.
7. Use **Stop Simulation** to revert to the manually configured build view. The original `matchdatateam.json` is untouched.

## What was changed

- `lib/build-recognizer.js`: Sharp image cropping, lightweight reference comparison, empty item detection, confidence/margin checks.
- `lib/build-recognition-routes.js`: localhost-limited scan/status/apply/stop endpoints; independent saved state in ignored `runtime/`.
- `public/build-recognition-test.html` and `public/script/build-recognition-test.js`: screenshot upload and review controls.
- `public/script/build.js`, `public/script/build-recognition-bridge.js`, `public/builds.html`: overlay only confirmed/empty recognized slots; optional detected battle-spell icons.
- `public/database/item-mappings.json`, `spell-mappings.json`: image to ID catalogs.
- `public/database/mlbb-ingame-item-spell-slot-map.json`: initial 1919×1078 slot positions from screenshot.

## Limitations

**No real-world recognition accuracy has been verified yet** using the user's source PNG icons. Similarity scores are heuristic and should not be interpreted as probabilities. Spell icons may be covered by cooldown overlays. Other aspect ratios, overlays, and OBS transforms require calibration. The test image has to be uploaded through the page. The server must be restarted after installing Sharp. Because this is a draft experiment, the Sharp dependency is intentionally installed manually and package-lock is not changed in this PR.
