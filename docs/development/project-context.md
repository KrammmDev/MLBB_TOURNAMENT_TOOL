# MLBB project context
Source: https://github.com/KrammmDev/MLBB_TOURNAMENT_TOOL
Inspected source revision: d475d6979edf392b8440693ecde84ad72643ca09. Recheck current code before implementation.

## Observed existing implementation
Node CommonJS, Express ^5.1.0, ws ^8.18.3, Multer ^2.0.2, Playwright ^1.62.0. npm start runs node server.js; npm test is a failing placeholder. Plain HTML/CSS/JS; no framework migration is required by this plan.

server.js serves public/ on port 3000, with in-memory cache, JSON persistence and a shared write queue. POST /api/matchdata replaces cache.matchdata from req.body and broadcasts updates. Other APIs handle matchdraft, theme, schedule, mapdraw, MVP, notifications, hero stats, tournament, archives and group preferences. crosshost.js/crossclient.js mirror browser storage through WebSockets. Do not mistake these overlapping paths for a unified authority contract.

Draft controls: public/control.html, controlban6.html and public/script/herodropdown*.js. Tournament rules/UI: public/controller.html. Other operator surfaces: postgamecontrol.html, schedulecontrol.html, panel.html and hub.html. Shared theme loader: public/script/theme-loader.js; server theme assets/config use public/Assets/costum/Theme/. public/database/theme.json also exists; confirm actual consumers before changing paths. overlay-display-v2.js duplicates much of overlay-display.js behavior. Multiple outputs poll APIs as well as use events.

Legacy OCR: public/script/scoreboaedocr.js tries http://localhost:14337/MLBB.json then a serverip-derived host. public/External/ holds ScoreSight settings. Windows batch launchers exist. No implemented custom OCR or obs-websocket control layer was established by inspection.

## Approved direction
Professional MLBB broadcast tool, three interchangeable complete themes, original MPL-inspired production quality. Build custom OCR in the SAME project folder/repository with an integrated panel and a single start/stop entry point. A supervised worker is compatible with this requirement; do not make a separate app/repository. Initial OCR fields: kills, gold, towers and game timer.

User uses OBS Virtual Camera and reports a clear OBS view but blurry/inaccurate OCR reading. Color Key is involved, but its exact placement and causal effect remain unverified. No representative screenshot/feed is available. The uploaded FalseOCR EXE exceeded a 32 MiB transfer limit and was not inspected or executed. Do not depend on it or describe its internals as known.

## Planned, not yet implemented
OCR capture/calibration UI, custom recognition engine, normalized ingestion API, field ownership/manual override, versioned theme manifests and supervised unified launcher improvements. Choose engine/runtime only after testing useful capture and target-machine constraints. No native-camera or actual OBS behavior has been validated in this skill-writing task.
