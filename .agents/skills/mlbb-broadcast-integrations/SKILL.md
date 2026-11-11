---
name: mlbb-broadcast-integrations
description: "Configure or implement OBS Browser Source compatibility, OBS Virtual Camera connection, LAN production deployment, external adapters, or optional obs-websocket scene and source control."
---

## Purpose and boundaries
Own external compatibility and connection lifecycle. mlbb-ocr-capture owns frame quality and recognition; mlbb-broadcast-core owns normalized state ingestion. Keep integrations in the same repository/project folder.

## Entry points
Inspect public/hub.html, server.js, serverip.txt usage, FALSEMLBBOVERLAYTOOL.BAT, FALSEMLBBOVELAYFIX.bat, public/script/scoreboaedocr.js and public/External/ScoresightSetting*.json. Existing browser overlays and ScoreSight settings do not establish an implemented obs-websocket layer.

## Workflow
1. Document the production topology: game/capture input -> OBS scene -> Virtual Camera -> OCR -> server -> Browser Source. Distinguish same-PC and LAN hosts; localhost in a remote browser means that remote PC.
2. Inventory Browser Source URLs, dimensions, FPS expectations, alpha/audio requirements, source visibility/shutdown settings and expected refresh/reconnect behavior.
3. Verify the actual Virtual Camera frame size and aspect ratio, not just OBS canvas settings. Compare the raw camera frame against the OBS preview. Test clean versus filtered input instead of asserting Color Key caused the reported blur.
4. Detect camera/service unavailability, permissions, changed device identities and capture contention. Offer actionable reconnect and source-selection behavior.
5. Maintain the legacy ScoreSight adapter only as explicitly configured compatibility. Do not make the new OCR depend on port 14337, the uploaded EXE or a separately installed ScoreSight app.
6. Normalize external data through an adapter contract; never write competition state directly from vendor payloads or bypass server validation.
7. If obs-websocket automation is requested, first verify installed OBS/API version, authentication and required commands. Keep credentials server-side and make reconnect safe against repeating live cues.
8. Support a single start/stop entry point. Supervise child worker readiness and shutdown, report occupied ports, and terminate only processes started by this launcher. List optional platform prerequisites honestly.

## Verify
Record OBS version, OS, camera dimensions and tested Browser Source lifecycle. Check refresh, hide/show, server restart, camera interruption and LAN reconnect. Browser screenshots alone cannot certify OBS rendering, Virtual Camera quality or scene automation.
