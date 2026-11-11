---
name: mlbb-ocr-capture
description: "Build or improve the integrated MLBB OCR module using OBS Virtual Camera, including frame quality diagnosis, region calibration, preprocessing, recognition, temporal validation and safe match-data updates."
---

## Purpose and boundaries
Build custom OCR within the MLBB Tournament Tool project, with an integrated panel and one launcher. The user reports clear OBS preview but blurry or inaccurate OCR input and has no sample screenshot available. Do not claim the cause or accuracy is established. Start with kills, gold, towers and game timer; confirm actual visible fields during calibration.

## Read first
Read references/capture-and-validation.md, ../../../docs/development/project-context.md and ../../../docs/development/contract-register.md. Inspect public/script/scoreboaedocr.js and server.js matchdata handling before wiring new output. OBS device plumbing belongs to mlbb-broadcast-integrations; authoritative mutations belong to mlbb-broadcast-core.

## Workflow
1. Establish measurable stages: source frame -> raw ROI -> optional upscaled ROI -> processed ROI -> raw OCR text -> parsed candidate -> accepted observation. Preserve timestamps, dimensions and coordinate mapping.
2. Obtain the highest useful device-supported capture mode and verify delivered dimensions/aspect ratio. A low-resolution preview is not proof that inference input is low resolution. Compare actual saved crops and logs.
3. Crop from the original frame before any preview downscale. Store normalized ROI coordinates with source dimensions, layout profile, HUD scale and side mapping. Reject invalid crops and require recalibration when geometry changes.
4. Provide unfiltered/filtered comparisons. Color Key might affect text edges but is not a proven cause; do not assume filters can be removed independently from a shared OBS source.
5. Benchmark candidate OCR engines on representative crops before committing. Compare raw, grayscale, contrast/threshold and modest upscale variants; sharpening cannot recover missing pixels. Restrict recognition to expected symbols per field and retain raw text.
6. Parse integer kills/towers, timer format and gold units/decimal separators explicitly. Treat missing or ambiguous output as unknown, never zero. Associate every sample with stable game identity, capture time and calibration revision.
7. Apply field-specific temporal checks, confidence thresholds and plausibility limits from measured fixtures. Avoid a universal majority vote that hides real changes. Detect stale/frozen input separately from unchanged valid values. OCR engine confidence is not calibrated accuracy.
8. Discard old-game, out-of-order, duplicate and superseded samples. Do not apply delayed worker output after reset or calibration change. Side swaps change mapping, not team identity.
9. Respect field-level manual override and auto-resume policy. Send normalized observations to a server ingestion path that patches only authorized fields. Never replace the complete matchdata document, advance a bracket or record a winner from OCR.
10. Keep capture/inference work off the latency-sensitive server path. Use bounded queues and discard obsolete frames rather than accumulating delay. A worker may live in ocr/ in this project and must be supervised by the shared launcher.
11. Until live feed is available, implement recorded/synthetic input adapters and label their limits. Do not require the uploaded FalseOCR EXE, execute it as a dependency or claim it was inspected.

## Verify
Use references/capture-and-validation.md for fixture categories and metrics. Cover blurry frames, animation, no signal, aspect changes, low confidence, corrections, manual overrides, reconnect and game reset. Report per-field accuracy and latency on the measured dataset. Real OBS capture and target-PC performance remain pending until actually tested.
