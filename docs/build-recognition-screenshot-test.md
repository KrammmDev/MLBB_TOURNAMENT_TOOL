# MLBB Screenshot Recognition

This first-stage feature tests item/spell image recognition using **an uploaded screenshot**. It is not yet an OBS Virtual Camera or live ADB reader. It does not replace existing OCR or directly edit `public/database/matchdatateam.json`.

## Installation on Windows

1. Pull the approved changes from `main` after merge, or check out the draft branch for local verification.
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

**No real-world recognition accuracy has been verified yet** using the user's source PNG icons. Similarity scores are heuristic and should not be interpreted as probabilities. Spell icons may be covered by cooldown overlays. Other aspect ratios, overlays, and OBS transforms require calibration. The test image has to be uploaded through the page. The server must be restarted after installing dependencies.

## Low-quality capture recognition (experimental)

The recognizer now compares **both the original frame and a mildly contrast-adjusted/sharpened frame** against the same reference catalog. Each icon has a small bounded set of geometric templates, including one slightly softened reference for compressed video.

- A confident original match is kept unless the enhanced pass confidently identifies a different item; disagreements are marked `uncertain`.
- An `uncertain` original result can be rescued only when the enhanced result agrees with its original best candidate **and** meets stronger confidence and margin requirements.
- Empty equipment slots still show `idle.png`; uncertain slots retain the configured/manual item.
- Hover an item or spell in the test page to inspect `reason`, `scoreGap`, alternative candidates, and original/enhanced scores.
- The scan summary reports **Recovered with enhancement** and **Preprocessing conflicts**. Recovery is *not* proof of correctness.

### Capture tips

Upload a PNG extracted directly from the original 1920×1080 (or higher) recording. Avoid uploading a screenshot of a browser video preview or scaling an already compressed capture. Keep the same aspect ratio and verify the equipment panel positions match the calibration map. Modest blur is sometimes recoverable; severe motion blur or missing detail cannot reliably be reconstructed by sharpening.

### Regression tests

```powershell
node --test test/build-recognition-lowquality.test.js test/build-recognition-improved.test.js
npm test
```

This is still screenshot-only; OBS multi-frame capture and cross-frame voting are **not implemented**. Before broadcast use, check the *correct item names*, not only the number of matched slots, against a manually annotated source screenshot.
