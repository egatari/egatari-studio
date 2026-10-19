### Added

- Editor app, Audio panel: a voice picker per speaking role (bob / alice for Japanese, Kokoro voices for English) with
  short pre-made samples (`lab/voices/samples/`); the choice goes to `voice.json` (kept in memory for single files)

### Changed

- Browser TTS: a voice name it does not have is handled alike in Japanese and English: the Audio panel says so and uses
  the role's default voice; the TTS window refuses unknown names instead of silently using `am_michael`
