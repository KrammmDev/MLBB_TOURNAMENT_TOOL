---
name: mlbb-broadcast-core
description: "Maintain MLBB Tournament Tool architecture, API and WebSocket contracts, shared state, persistence, concurrency, or recovery. Use for cross-module state changes and OCR-to-match integration."
---

## Purpose and boundaries
Own state authority, transport, persistence and compatibility. Competition rules belong to mlbb-competition-systems; OCR image processing belongs to mlbb-ocr-capture. Keep OCR in this repository and project folder. A managed worker is allowed when needed; a separate product, repository or manual launcher is not the target.

## Read first
Read ../../../docs/development/project-context.md and ../../../docs/development/contract-register.md. Recheck server.js, package.json and the affected consumers before editing. Paths and contracts in these documents are observations, not a replacement for current source.

## Workflow
1. Trace each affected field from controller or OCR observation through server cache, JSON persistence, REST/WS and every display consumer.
2. Identify its authority and whether it is persistent state, an ephemeral cue, or a local preference. Avoid creating another writable authority in localStorage.
3. Document current versus proposed contracts in the contract register. Define validation, match identity, revision checks, acknowledgement and stale-write behavior before changing clients.
4. Prefer commands or field patches handled on the server. The existing matchdata POST replaces the whole document; do not send an OCR-only object to it or race a GET/modify/POST against operator changes.
5. Serialize durable writes, snapshot the intended revision, use atomic replacement where supported, and report write failures. Do not report durable success for merely queued work.
6. Make startup loading finish before accepting dependent traffic. Define corrupt-file recovery, backup handling and schema migration without erasing operator data.
7. Use a shared connection lifecycle with reconnect/backoff, current snapshots and revision handling. Do not blindly merge stale browser storage after reconnect. Keep time authority explicit; timer rendering must not require disk writes every tick.
8. Preserve existing overlay URLs during incremental extraction. Do not introduce a framework, database or microservices without a concrete project need.
9. Validate payloads, upload names/types/limits and controller/viewer boundaries. Do not expose runtime secrets or worker controls through public static files.

## Verify
Exercise two controllers editing different fields, stale clients, reconnect, restart and persistence failure. For OCR, test manual override and match-reset rejection with the competition and OCR skills. Record which checks actually ran; use mlbb-production-validation for shared regression scenarios.
