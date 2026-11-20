# USB ADB OCR capture (Windows / physical phone)

The existing camera, screen capture, test-image, custom OCR and FalseOCR paths remain available. USB ADB is an **optional** frame source for the same OCR preview, calibration, manual Lock/Auto and scoreboard overlay.

## Setup

1. Install official Android SDK Platform Tools. On the server PC, confirm `adb devices -l` reports the phone as `device` (not `unauthorized`).
2. If `adb.exe` is not in Windows PATH, start the Node server in Command Prompt with:
   ```bat
   set "ADB_PATH=D:\platform-tools-latest-windows\platform-tools\adb.exe"
   npm start
   ```
   Adapt the path if your platform-tools folder differs. The environment variable applies to that terminal session.
3. On the **same server PC**, open `http://localhost:3000/ocr-control.html`. ADB device and frame endpoints intentionally reject LAN clients.
4. Select an authorized phone under **USB ADB device**, click **Connect USB ADB**, and review the native 2400×1080 landscape preview (resolution may vary by phone).
5. Draw the score regions for the current HUD; **Save calibration**, then **Start preview / new game**. Inspect raw and processed crop output and readings.
6. When verified, choose **Take custom OCR live**. The existing `scoreboardocr.html` browser source URL remains unchanged.

## Capture behavior and limitations

- Screenshot capture is paced at approximately one screenshot per second, one ADB subprocess at a time. If a screenshot is slow, the next capture is delayed or skipped; frames are not queued.
- The MLBB spectator game keeps running. ADB does not pause or modify the phone.
- OCR recognition can run slower than screenshot capture, especially with many calibrated fields. No claim of guaranteed 1-second end-to-end update latency.
- Capture failure, disconnect, orientation/resolution change, or authorization loss **stops OCR** and requires reconnection and verification. No stale zeros are manufactured.
- `adb exec-out screencap -p` reads the on-screen pixels, **not** internal match data.
- A USB ADB profile is keyed to the device serial and frame geometry. Camera/screen/image profiles are not automatically migrated; saving a new calibration replaces the saved profile, so export/back up an existing calibration if it must be reused later.
- Never expose the ADB interface to the Internet. Server capture APIs are loopback-only and do not support shell commands, touch input, or installs.

## Validation

Run `npm run test:ocr`, `npm test`, and `npm run test:browser` in the repository's fully installed Node environment. For a live acceptance check, confirm 5+ minutes of stable USB preview, crop readability for both kill counters and the game timer, manual Lock/Auto behavior, fallback to FalseOCR, and camera/screen capture regression.

If ADB is not found, ensure `ADB_PATH` is correct and restart Node. If `unauthorized`, unlock the device and approve USB debugging. If the device reports `offline`, reconnect USB and refresh devices.
