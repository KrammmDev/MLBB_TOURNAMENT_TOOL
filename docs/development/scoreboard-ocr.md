# Integrated scoreboard OCR

`scoreboardocr.html` keeps its existing overlay layout. It can read the original FalseOCR JSON feed or the new capture desk. The normal scoreboard, draft, notifications and competition results are independent of OCR telemetry.

## Operator setup

1. After pulling this version, run `npm install` once, then the usual `npm start`. The local JavaScript OCR worker and English model are installed with npm; no extra EXE, Python or separate server is required.
2. On the **server/capture PC**, open `http://localhost:3000/ocr-control.html` in current Chrome or Edge. A link is also under Command Center controls. Keep this capture page open while using custom OCR. A LAN HTTP address does not grant browser camera access; other PCs can still open the scoreboard output.
3. Start OBS Virtual Camera with a **clean game feed**, then select it in the camera dropdown. Requesting 1920×1080 does not guarantee the device delivers it: check the displayed **native dimensions and negotiated FPS**. The panel uses the delivered video dimensions, not its CSS preview size. Avoid capturing the output scoreboard in its own OCR input.
4. Select each field and drag tightly around the digits: blue/red kills, gold, towers and timer. Lords are optional. A field without a calibrated region remains unknown. Blue/red describe the current HUD sides; verify mapping after every side swap. Draw again if the HUD layout, HUD scale, source, aspect ratio or resolution changes.
5. Compare **Raw pixels** against **Processed pixels**. Try original color, grayscale, inversion or threshold, and modest 1×/2×/3× scaling. Threshold can remove a timer colon; it is not universally better. The 16 extra processed pixels are padding, not source detail. `Export PNG` saves the unannotated native frame; `Export raw crop` saves original ROI pixels.
6. Save calibration, then **Start preview / new game**. Compare raw text, engine score and accepted values to the visible game. Minimum score defaults to 85; this is an engine threshold, **not an accuracy percentage**. Preview never changes broadcast output. Still-image uploads are for tests only and cannot go live.
7. **Take custom OCR live** when verified. It clears preview observations so live values must confirm again. Add the existing `scoreboardocr.html` URL in OBS at 1920×1080. No additional browser source is needed for OCR.
8. Use each field’s **Lock** for an operator correction; **Auto** clears that field and resumes confirmation. A new session clears all locks. **Use FalseOCR output** restores the original source at port 14337. Optional URL pins `?ocr=legacy` and `?ocr=custom` are for checking the two outputs; omit them for normal saved selection.

Do not move the game forward by changing OCR numbers. Game/match/team changes invalidate the OCR session. Identical game resets cannot be detected from the current match document: explicitly start a new session. A camera stream that continues to supply a frozen OBS image is also not distinguishable from a paused game by image equality alone; the operator must verify the source.

## Data flow and safeguards

The browser captures a native video frame, crops it before scaling, optionally processes each ROI, and sends a single bounded batch to `/api/ocr/read`. The server’s local Tesseract.js worker runs outside the Express event loop. There is one batch at a time, no accumulating frame queue. Raw text, score, parsed candidate, capture time and accepted time remain inspectable in `/api/ocr/state`.

`runtime/ocr.json` stores the selected source and calibrated profile using atomic, revision-guarded saves. It is not a live database export. Readings and manual overrides are session-only and clear on restart. Profile reference records delivered dimensions, capture kind and device/source identity; normalized ROIs retain their exact pixel mapping. A changed HUD at unchanged geometry still requires operator recalibration.

The server rejects incorrect crop dimensions, stale timestamps, old sequences, changed profiles, previous sessions and delayed output from a previous game. Counts require consecutive equal candidates; timer/gold allow normal advancement and use grammar, score and monotonic plausibility checks. These initial thresholds are configurable/conservative baseline behavior; they have not been calibrated against a representative live-game dataset. Automatic accepted readings expire after four seconds; missing capture reads expire the whole session after fifteen seconds, including manual locks. A stalled worker is terminated and can be restarted by starting preview again.

`ocr_update` travels through the existing WebSocket broadcaster. The overlay also polls the latest state to recover from missed events and enforce expiration. OCR never writes `/api/matchdata`, records a winner, advances a bracket, or changes a draft. Team names, logos, series markers and turtle icons still come from match data. OCR kill updates target the nested value spans and preserve turtle containers. Invalid timer values show `--:--`; the old fabricated `00:00`, automatic +2 seconds and infinite local clock are removed from this page. The legacy reader file is left available for other consumers.

## Verification and limits

Run `npm test` and `npm run test:ocr`. The OCR browser fixture uses a synthetic 1920×1080 camera stream to verify native crop geometry despite a smaller preview, saved calibration, preview isolation, live output, legacy rollback, unknown values, turtle preservation, responsive controls and track cleanup. A clean synthetic timer and a blank crop exercise the actual installed OCR worker. Unit tests cover temporal checks, low scores, leases, override release, persistence failure, revision conflicts, old-game jobs and bounded processing.

A preliminary **rendered-overlay screenshot**, not a clean game HUD, was used only for preprocessing comparison: five crop locations, raw/2×/threshold variants. The two kill crops and one gold crop were readable; the timer required 2× scaling for a strong engine score, while threshold removed its colon. One crop contained no readable gold digit and stayed unknown. Measured per-crop worker calls on this cloud machine were approximately 3–38ms after initialization. This small diagnostic is not a live accuracy benchmark.

**Actual Windows OBS Virtual Camera quality, live field accuracy, animation/blur performance and target-PC end-to-end latency remain unverified.** For the next calibration pass, export a native game frame and raw field crops from the real feed and compare them with OBS’s native screenshot. Check the actual delivered dimensions, HUD edges and filters at that stage. Color Key is a possible variable, not an established cause of the reported blur. Upscaling cannot restore detail already missing from the incoming frame.

## Camera freshness recovery

The capture element is a rendered playback monitor rather than a hidden video. Freshness uses both presentation callbacks and `getVideoPlaybackQuality().totalVideoFrames`; suppressed presentation callbacks alone cannot disconnect a camera whose decoding continues. The monitor also works when presentation callbacks are unavailable but decode counters are supported. OCR reads require new frame evidence and do not repeatedly timestamp an unchanged decoded frame as new input.

After five seconds without either form of frame progress, recognition pauses and invalidates its session while the camera track stays connected. When video resumes, verify the feed and click **Start preview / new game**, then take live again. Recovery never silently puts a previous game back on air. Ended tracks and changed capture dimensions still require reconnection/recalibration. Browser/OS suspension can still pause work in a background page; keep the capture desk open and disable sleeping tabs for it on the broadcast PC if necessary. Real Windows/OBS behavior must still be checked on the target machine.

Regression coverage suppresses all presentation callbacks while real Chromium decode counters advance beyond the former timeout, then freezes those counters to verify OCR pauses without ending the camera, output becomes unknown, and decoding can recover into a fresh preview session.
