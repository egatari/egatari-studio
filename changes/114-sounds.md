### Added

- Add component sound synthesis for bells, chimes and notes, with deterministic PCM rendering and video audio mixing that preserves notes across steps. In talk and learn playback, sound only forward time crossings after a user gesture; preserve note tails on forward step entry and stop them on back, jump or seek. Re-time live events for viewer step extensions.
- Add a keyboard-accessible “Mute sound effects” toolbar toggle, shown when a component declares sounds or implements `events(k)`, with a saved device preference. Temporarily silence component sounds in editor recording mode without changing that preference. Bundle both sound modules into built lessons and the editor.
