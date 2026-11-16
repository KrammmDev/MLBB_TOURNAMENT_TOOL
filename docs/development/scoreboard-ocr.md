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

## Android USB mode (no OBS)

The capture desk now supports a direct **Android → USB/ADB native PNG → existing OCR → scoreboard** path. It does not require OBS, Virtual Camera, a scrcpy window or an extra OCR server. This is screenshot sampling, not high-frame-rate video mirroring.

### One-time setup and use

1. Download Google's [Android SDK Platform Tools](https://developer.android.com/tools/releases/platform-tools). Extract the entire `platform-tools` folder into the project's `tools` directory, resulting in `tools/platform-tools/adb.exe` on Windows. Retain its DLLs. Alternatively put ADB on PATH or set `MLBB_ADB_PATH` to its executable before `npm start`. See `tools/README.md`. No binary download is automated or bundled.
2. Enable Developer options / USB debugging on the phone. Use a USB data cable, unlock the phone and approve **Allow USB debugging** for this PC. Install the phone manufacturer's Windows USB driver if device detection needs it. Open the game/spectator HUD in the intended landscape orientation before calibration.
3. Run the existing `npm start`, then open `http://localhost:3000/ocr-control.html` on the PC physically connected to the phone. USB device controls and screen frames are intentionally local to this PC. No camera permission or window selection is needed for USB capture. LAN broadcast scoreboard URLs remain usable.
4. Click **Detect phones**, select the ready device, then **Start USB capture**. Unauthorized/offline devices are labelled and cannot be selected as ready. With multiple ready devices, explicitly select the phone. The panel shows delivered native dimensions, screenshot latency and frame count.
5. Draw/verify every field's native region, **Save calibration → Start preview**, compare readings to the phone, then **Take custom OCR live**. Keep the panel open. The normal `scoreboardocr.html` receives this telemetry through the existing channel.
6. Disconnecting/stopping the USB source, unplugging, a capture timeout or a changed phone resolution/rotation invalidates the dependent OCR session, including manual overrides. Reconnect/detect and verify calibration before going live again. Stop recognition pauses OCR while USB preview remains active; **Disconnect** releases both. Closing the panel sends a stop; a fifteen-second idle capture lease also cleans up abandoned captures.

### Capture and gold integrity

The fixed command is `adb -s <detected-serial> exec-out screencap -p`. [Android documents PNG screen capture over ADB](https://developer.android.com/tools/adb#screencap). PNG bytes are kept binary through Node and decoded at their native dimensions in the browser. Preview CSS scaling does not scale inference crops. Each batch crops both teams from the same screenshot and carries the timestamp from the start of that capture request, not the time the browser finished processing it. No original frames are stored on disk; operators can still export native frames/crops on demand.

The adapter runs one bounded process operation at a time, with no accumulating frame queue. Slow screenshots older than four seconds are discarded. Processes have an eight-second timeout and 32 MiB output cap; only child commands started by this adapter are stopped. It never issues `kill-server`, modifies the phone, installs an APK or reads game memory. Saved USB profiles use the phone's serial, reference geometry and existing normalized ROIs. Runtime capture IDs are not persisted.

Gold lead is now enabled in the OCR scoreboard and requires two fresh automatic gold values accepted from **the same batch**. If one side fails and the other advances, the lead is hidden instead of mixing captures. Two explicitly locked manual values can also supply a lead; a single manual value paired with an automatic value cannot. Both values from a legacy JSON response remain paired within that response. `50.5K` is still a rounded HUD value; a computed lead cannot claim more precision than its source.

### Verification and pending hardware benchmark

`npm run test:ocr` includes device-list parsing/authorization, serial selection, argv-only spawning, byte-preserving output, timeout/cancellation/size caps, localhost controls, leases, delayed frames, rotation rejection, dependent OCR invalidation, and a Chromium USB-source fixture. That fixture exercises native crop calibration, preview/live selection, accepted paired gold, hiding mixed-frame gold lead and unplug handling without invoking a camera API or OBS. Existing real-worker clean/blank recognition and camera recovery tests remain in place.

No real Android device is attached to the cloud workspace. **Windows driver compatibility, capture latency/FPS and per-field live accuracy remain pending on the user's phone/PC.** This transport avoids an OBS resize/compression stage but does not guarantee OCR accuracy. Record native sample frames and manually checked gold values before production use. Compare exact values/false accepts, rejection rate and p50/p95 end-to-end latency. Scrcpy's encoded video stream is a possible later performance adapter; it was not implemented or benchmarked here. Its [official video documentation](https://github.com/Genymobile/scrcpy/blob/master/doc/video.md) describes resolution, bitrate and frame-rate tradeoffs. The initial PNG adapter prioritizes inspectable native pixels and reuses the existing project architecture.
