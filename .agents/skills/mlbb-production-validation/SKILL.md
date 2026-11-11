---
name: mlbb-production-validation
description: "Validate MLBB production changes with domain regression, API/WS integration, visual theme parity, OCR benchmarks, performance measurement, Windows launch checks and release recovery."
---

## Purpose and boundaries
Own shared production scenarios and evidence. Feature skills still verify their work. Use targeted checks based on risk; do not add tests that merely repeat implementation. Do not run live resets/imports against an operator production dataset.

## Read first
Read ../../../docs/development/project-context.md and references/scenario-matrix.md. Inspect package.json and actual test configuration. Playwright is a dependency; the current npm test script is a failing placeholder and is not a verification suite.

## Workflow
1. Record baseline revision, changed responsibilities, test fixtures and available hardware. Separate observed results from proposed budgets and untested assumptions.
2. Use an isolated runtime data directory and deterministic fixture IDs. Preserve original database/assets; do not commit live match data, test recordings or camera frames as incidental artifacts.
3. Test competition invariants with rule-level fixtures, API/event contracts with integration scenarios and UI wiring with focused browser checks.
4. For graphics, compare all three themes with identical state and freeze animation/time where needed for stable baselines. Check missing assets and long text.
5. For OCR, measure exact parsed-field accuracy, false accepted changes, rejection rate, freshness and capture-to-accepted latency separately. Split tuning and evaluation data. Synthetic success is not live-feed accuracy.
6. Profile polling, payload bytes, event fan-out, write queue growth, CPU, memory and capture/inference backlog under multiple overlays. Set budgets after measuring target hardware; do not promise 60 FPS or a fixed accuracy without evidence.
7. Validate clean Windows setup and one-launcher start/stop, dependency/model availability, unavailable cameras, occupied ports and worker crashes. Test actual OBS separately from browser automation.
8. Exercise backup/restore and rollback including schema/theme compatibility. Record commands and outcomes; never label a queued operation as durable without checking persistence.

## Completion report
State what changed, what passed, what failed and what needs target-PC/OBS verification. Do not claim full broadcast readiness from static inspection, test counts or a successful browser screenshot.
