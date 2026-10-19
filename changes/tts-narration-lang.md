### Fixed

- Editor app, browser TTS: the engine (Irodori or Kokoro), the voices and the reading dictionary follow the narration language
  (`voice.json` `"lang"`, then the narration text, then `<html lang>`), so English narration in a Japanese deck is no longer sent to Irodori
- Editor app, single-file editor (`file://`): the Audio panel says that “Regenerate with TTS” is not available there and suggests recording
