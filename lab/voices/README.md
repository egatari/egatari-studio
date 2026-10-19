# Voices for the lab page

`bob.wav` (Expert) and `alice.wav` (Novice) are the default synthetic voices of this project, 48 kHz mono.
No real person's voice was recorded or cloned. They are copies of `tts/voices/bob.wav` and
`tts/voices/alice.wav`; see `tts/voices/README.md` there for how they were made and their licenses
(Qwen3-TTS: Apache-2.0, Irodori-TTS: MIT). AI-generated audio.

`samples/` holds the short previews of the voice picker in the editor's Audio panel (MP3, 44.1 kHz mono, 48 kbps; playing one does not load a model).
`bob.mp3` and `alice.mp3` are the first sentence of `bob.wav` / `alice.wav`. The English ones were made with Kokoro-82M v1.0
(kokoro-js 1.2.1, fp32, `onnx-community/Kokoro-82M-v1.0-ONNX@1939ad2a8e41`, Apache-2.0), reading "Let's look at the results together.
The pattern is clearer than you might expect.", trimmed and set to −20 LUFS. AI-generated audio.
