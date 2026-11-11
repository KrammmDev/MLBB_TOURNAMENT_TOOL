# Capture and reading validation
## Capture diagnosis
Record OBS/output settings, camera negotiated/delivered width and height, FPS, color format where available, raw frame dimensions, ROI pixel sizes and preview scale. Inspect each stage without relying on a stretched UI thumbnail. Compare no processing, clean feed and filtered feed under the same game frame when feasible. Detect letterboxing and coordinate mismatch.

## Calibration profile (proposed)
Store profile version, source identity, reference dimensions/aspect, HUD layout/scale, normalized x/y/width/height per field, team/side mapping and processing options. Validate bounds and minimum useful ROI size. Device changes and layout changes invalidate dependent readings until verified.

## Candidate observation (proposed)
Include gameId/generation, calibrationRevision, field, side/team mapping, capturedAt, sequence, rawText, parsedValue, engineScore and decision/status. Server acceptance must use active game identity, field ownership and freshness. Record acceptedAt separately; never replace capture time with processing completion time.

## Field rules
Kills/towers: integer grammar and configured bounds; decreases require reset/correction handling. Gold: explicitly parse K and decimal formatting; account for display rounding rather than assuming every frame strictly increases. Timer: parse MM:SS, enforce seconds 00..59, allow pauses and intentional corrections, and reject unexpected jumps using game context. Do not infer a zero from unreadable pixels.

Start temporal thresholds as named configuration, then tune against data. Keep candidates visible without publishing them. Manual mode blocks automated writes until an explicit resume action or documented scope expiry. A stable numeric result alone cannot identify a frozen camera; use frame timestamps/device health and suitable frame-change signals.

## Evaluation set
Cover clean, compressed, low-resolution, blurred, Color Key affected/unaffected, moving graphics, hidden HUD, pause, reset, side swap, disconnect and missing device. Keep ground-truth labels per field and timestamps. Split tuning/evaluation clips by recording/session to reduce leakage.

Measure exact parsed-value accuracy per field, false accepted updates, rejection/unknown rate and p50/p95 capture-to-accepted latency. Report dataset size, machine, input mode and thresholds. Do not hide errors behind aggregate accuracy. No representative user feed is available yet; live accuracy and the cause of blur are unverified.
