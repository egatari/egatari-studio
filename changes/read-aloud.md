### Added

- Player: **Listen with read-aloud (not saved as audio)** in the control bar reads a step without audio with a voice of the device
  (local `speechSynthesis` voices only), shows “Reading aloud (this device's voice)”, and stops on the next step; never in video or print (format spec §5.6)
- Editor app: the Audio panel can read the current step or the selected word aloud with the device voice, with `{x|y}` readings, the reading dictionary
  and `join-num-counter@1`; nothing is written. `app/read-aloud.js` exports `readAloud(text, lang)` for the Pronunciation button (#101)
- `kit/core/read-aloud.mjs`: the text to speak and the local-only voice choice, shared by the player (`DECK.ReadAloud`) and the editor
