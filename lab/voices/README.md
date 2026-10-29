# Voices for the lab page

The default reference voices (`bob.wav`, `alice.wav`, 48 kHz mono, synthetic; no real person's voice was recorded or cloned) live only in `tts/voices/`; this folder holds no copies (`npm run build:app` copies them into `dist/lab/voices/` for the lab pages). See `tts/voices/README.md` for how they were made and their licenses (Qwen3-TTS: Apache-2.0, Irodori-TTS: MIT). AI-generated audio.

`samples/` holds the short previews of the voice picker in the editor's Audio panel (MP3, 44.1 kHz mono, 48 kbps; playing one does not load a model).
`bob.mp3` and `alice.mp3` are the first sentence of `bob.wav` / `alice.wav`. The English ones were made with Kokoro-82M v1.0
(kokoro-js 1.2.1, fp32, `onnx-community/Kokoro-82M-v1.0-ONNX@1939ad2a8e41`, Apache-2.0), reading "Let's look at the results together.
The pattern is clearer than you might expect.", trimmed and set to −20 LUFS. AI-generated audio.
