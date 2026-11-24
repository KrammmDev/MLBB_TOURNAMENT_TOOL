# MLBB Screenshot Recognition

This feature recognizes item/spell icons using either **a manually uploaded PNG** or **an ADB screenshot captured from an authorized Android device**. It is not an OBS Virtual Camera capture source. It does not replace existing OCR or directly edit `public/database/matchdatateam.json`.

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

**No real-world recognition accuracy has been verified yet** using the user's source PNG icons. Similarity scores are heuristic and should not be interpreted as probabilities. Spell icons may be covered by cooldown overlays. Other aspect ratios, overlays, and OBS transforms require calibration. Use an uploaded screenshot or the ADB capture controls on the page. The server must be restarted after installing dependencies.

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

OBS video input, multi-frame voting and screenshot stabilization are **not implemented**. Before broadcast use, check the *correct item names*, not only the number of matched slots, against a manually annotated source screenshot.

## Android Debug Bridge (ADB) capture

The screenshot test page now includes **Refresh Devices**, a device selector, **Capture & Scan**, and **Start/Stop Auto Scan (5s)**. Existing localhost-only ADB endpoints are reused without changing the ADB service:

- `GET /api/adb/devices` lists authorized, unauthorized, and offline devices.
- `GET /api/adb/frame?serial=...` grabs an authorized device's PNG screenshot with `adb exec-out screencap -p`.
- The browser submits the returned PNG to `POST /api/build-recognition/scan` and shows the same review grid as manual upload.
- **Auto Scan runs one capture and recognition request at a time**, waiting five seconds after each completed scan. It **never automatically applies** to `builds.html`; click **Apply to Builds** only after reviewing results.
- Stop Auto Scan explicitly or close/reload the page to stop scheduling captures. Capture/scan errors and device changes stop it as well. If a scan is already in progress, wait until it finishes before applying/stopping.
- The image must contain the same 10-player **spectator equipment panel** calibrated in `public/database/mlbb-ingame-item-spell-slot-map.json`. Capturing a normal player's UI or a different HUD layout will not yield valid detections.

### Windows setup

1. Install official Android SDK Platform Tools; verify `adb version` works in PowerShell (or configure `ADB_PATH` for the server).
2. Enable Developer options and USB debugging on the Android device, connect via USB, and approve the PC's debugging authorization.
3. Run `adb devices -l` and confirm the phone reports `device`, not `unauthorized` or `offline`.
4. In `D:\\MLBB_TOURNAMENT_TOOL`, run `npm ci`, then `node server.js`.
5. Open `http://localhost:3000/build-recognition-test.html` **on the server PC**. Select the authorized device, press **Capture & Scan**, inspect matches, and press **Apply to Builds** only when ready. You can use Auto Scan if desired, but it only refreshes the draft.

If no phone is connected, manual screenshot upload continues to work. ADB is not used for OBS recorded-video or virtual-camera capture.

## Resolve uncertain items and spells manually

After uploading a PNG or running an ADB Capture & Scan, **click an uncertain slot** in Blue or Red Team to open the compact asset picker. The picker contains a search field and icons sourced directly from the existing `item-mappings.json` and `spell-mappings.json`. Item slots offer **Clear Slot** to display `idle.png`; spells do not support equipment idle.

1. Click the amber-bordered `?` slot. Auto Scan stops so it cannot overwrite the draft while you are correcting it.
2. Search and choose an item/spell. Use **Confirm Selection** to save the choice to the server's current scan draft.
3. The corrected slot becomes a green-bordered manual match (or a manual empty slot). Continue correcting other uncertain slots.
4. Press **Apply to Builds** when the results are ready. Only then does the separate recognition state update `builds.html`.
5. **Every fresh scan is a new draft.** Earlier manual selections are not automatically carried into a new screenshot. A scan ID guards against applying corrections to obsolete captures.

The manual correction route `POST /api/build-recognition/correct` is localhost-only, validates team/player/slot/type/asset ID against the mapping JSON, and cannot modify match data. Manual corrections do not update the reference library or teach the matching algorithm; they only fix the current scanned draft. Browser hardware/OBS integration is unchanged.

Run the regression test using `node --test test/build-recognition-corrections.test.js`, followed by `npm test`.
