# Contract register
Keep this as the authoritative index of shared implementation contracts. Before work, record current fields/event shapes from actual code, then label proposals separately. Do not duplicate competing specifications inside skills.

| Contract | Owner | Required decisions |
| --- | --- | --- |
| State/API/WS | broadcast-core | authorities, schema versions, commands, revisions, snapshot and durable acknowledgement |
| Competition identity | competition-systems | team/side identity, series/game generation, results and reset semantics |
| OCR observations | ocr-capture + broadcast-core | capturedAt/sequence, calibration revision, field parsing, freshness, rejection and manual lock |
| Theme manifest | broadcast-design-system | theme revision, compatible outputs, assets, activation and rollback |
| Operator cues | production-workflows | edit/preview/publish, acknowledgement, interruption and recovery |
| Adapter lifecycle | broadcast-integrations | host topology, ready/error, reconnect, source visibility and worker supervision |
| Acceptance evidence | production-validation | fixtures, measured budgets, target hardware and unverified checks |

Existing POST /api/matchdata replaces the complete match document. Proposed OCR ingestion must avoid partial-document replacement and lost updates. Do not invent endpoint names as existing APIs; update this register alongside actual implementation.
