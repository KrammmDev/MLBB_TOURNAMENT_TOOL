---
name: mlbb-production-workflows
description: "Improve MLBB operator panels, hub navigation, live cues, draft or match workflows, OCR calibration UI, manual overrides, feedback, shortcuts and recovery actions."
---

## Purpose and boundaries
Own the operator journey and visible action semantics. Keep technical diagnostics in a dedicated diagnostic view unless they support an operator decision. Viewer graphics belong to mlbb-broadcast-design-system.

## Entry points
Inspect public/hub.html, control.html, controlban6.html, controller.html, postgamecontrol.html, schedulecontrol.html and panel.html. The OCR panel and one-launcher workflow are approved targets, not existing features.

## Workflow
1. Trace setup -> active match -> draft -> gameplay -> result -> next game, including corrections and reconnect. Preserve capabilities when consolidating panels.
2. Show active tournament/game identity, side mapping, phase, connection status, save acknowledgement and on-air status only when actually known.
3. Distinguish edit, preview and publish/cue actions. Do not label a local preview as on-air without OBS or renderer evidence.
4. Protect focused edits from polling/remote overwrites. Surface conflicts and failed saves; do not show success before acknowledgement.
5. Use keyboard access, meaningful labels and shortcuts that do not fire inside text inputs. Reserve confirmation for destructive operations; provide undo/correction where practical.
6. For OCR, expose camera selection, actual input resolution, crop adjustment, raw/processed crop previews, accepted versus candidate readings, stale/uncertain status and per-field auto/manual controls. Do not replace missing readings with zero.
7. Make team-side calibration explicit. A manual correction must persist according to the documented override policy until the operator deliberately resumes auto mode.
8. Keep OCR under the same project navigation and launcher. If a worker is needed, show its ready/error state and recovery control without requiring another app workflow.

## Verify
Exercise the full operator journey with keyboard input, long names, connection loss, failed writes, game resets and OCR disagreement. Verify shortcuts, focused edits and manual overrides. Ask for preferences only when they materially change behavior; use existing authorization for routine reversible implementation choices.
