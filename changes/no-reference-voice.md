### Security

- Export to an Egatari file (`--portable`, `npm run portable -- pack`, the editor's **Save** and **Export**) never packs a reference voice (the recording an AI voice imitates) named in `voice.json` (Egatari §5 `recipe`, owner decision 2026-10-28): a step's audio or an attachment that is one (by location or by content) is left out with a finding that names the rule, and export is refused (`reference-voice`) when the slides use one. Names resolve through `IRODORI_REF_DIR` when that folder is inside the working folder.
- Quality check: `refVoice` reports a reference voice inside the working folder (error when the slides use it, warning as a step's audio or in `attachments/`, information elsewhere); the editor's quality check warns too.
