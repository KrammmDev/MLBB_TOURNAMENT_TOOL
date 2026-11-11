# Production scenario matrix
| Change | Minimum meaningful checks |
| --- | --- |
| State/API | concurrent fields, stale revision, reconnect snapshot, persistence failure, restart |
| Draft/result | legal phases, correction/swap, pause/reset, repeated result and corrected result |
| Brackets | byes, group ties, qualifying order, lower bracket, final reset |
| Themes | identical fixture across all three themes, asset failure, long text, active-state switch |
| Operator UI | focused edits, keyboard flow, failed save, manual override, next-game handoff |
| OCR | labeled fields, unknown/no signal, false change, latency, old-game sample, manual lock |
| OBS | refresh/hide/show, server/camera restart, actual delivered resolution, local/LAN |
| Launcher | clean Windows start, readiness, occupied port, child crash, scoped shutdown |

Use targeted scenarios for small changes. Run integrated rehearsal when multiple boundaries change. Record hardware-dependent checks as pending when unavailable; no invented pass results.
