### Changed

- Editor app, Audio panel: a recorded, imported or TTS take is used for the step right away;
  **↶ Revert to previous** brings back the step's earlier audio (no audio file is deleted). "Use this take" remains only when writing failed
- Editor app, Audio panel: the script field grows with the narration, can be resized, and labels every turn (Expert too) in a dialogue
- Editor app, Audio panel: without WebGPU the panel suggests recording first and no longer points to `tts/synth.py`
