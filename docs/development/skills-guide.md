# MLBB Tournament Tool — project skills

Seven repository-local Codex skills for the existing Node/Express broadcast tool and the approved integrated custom OCR direction. These are development instructions, not an implementation of the OCR app.

## Use in this repository
The skills live in `.agents/skills/` and supporting project documents live in `docs/development/`. Keep the hidden `.agents` folder when copying or downloading the repository. Reopen the repository in Codex so repository-local skills can be discovered; discovery behavior depends on the Codex client. No global installation is required.

## Skills
| Skill | Use |
| --- | --- |
| mlbb-broadcast-core | State, APIs/WS, persistence, concurrency and recovery |
| mlbb-competition-systems | Draft, results, brackets and statistics |
| mlbb-broadcast-design-system | Shared rendering, graphics, motion and three themes |
| mlbb-production-workflows | Operator panels, cues, calibration and manual control |
| mlbb-broadcast-integrations | OBS, device/LAN adapters and unified launcher |
| mlbb-ocr-capture | Capture diagnosis, crops, recognition and accepted observations |
| mlbb-production-validation | Regression, visual parity, OCR metrics and release checks |

Use only relevant skills. For an integrated OCR feature: OCR specifies observations; competition specifies identity and resets; core validates/persists field updates; workflows exposes calibration and overrides; integrations verifies camera/launcher behavior; validation measures correctness and latency. Design consumes accepted state across all themes. Ordinary color changes need design and targeted validation, not all seven workflows.

OCR is independent guidance because owning capture, preprocessing and recognition is now approved scope. Its code still lives in the same project folder and uses the shared server. Do not create separate skills per theme, overlay, language or library.

## Suggested implementation order
1. Establish state ownership, game identities and safe field-level ingestion.
2. Implement raw Virtual Camera capture, actual-resolution diagnostics and calibrated ROI previews.
3. Benchmark recognition and temporal acceptance, then wire overrides and match updates.
4. Validate a unified start/stop flow on the target Windows/OBS machine.
5. Establish shared theme contracts and expand coverage across three themes.

No representative capture was supplied. The cause of blur, engine choice and real accuracy remain to be measured. These documents add development guidance only; the OCR application is not implemented by installing these skills.
