### Changed

- Samples (`sample.json`) may carry labels: `purposes`, `subjects` and `audiences`, each a list of ids (empty = fits every one; handoff #43). The ids are not written in Studio: they come from the default parts catalogue's manifest (parts library 2.16.0: 25 purposes, 11 subjects, 5 audiences), which `tools/make-llm-guide.mjs` copies into the AI instruction data with each part's subjects and audiences. The six samples kept only in Studio (heikin-chuouchi, kokugo-kanbun, minimal, pitch-fictional, rashomon, tmlr2026-calibration) are labelled.
