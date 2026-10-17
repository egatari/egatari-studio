# mlx reference clips for Test D

Made on a Mac with the local mlx-audio server (`mlx-community/Irodori-TTS-500M-v3-fp16`,
`POST /v1/audio/speech`, `response_format: wav`, no seed given), with `lab/voices/bob.wav` and
`lab/voices/alice.wav` as the reference (identical to `tts/voices/*.wav` on the `windows` branch).
The texts are Test B sentences 4, 5 and 8 after the reading dictionary. The 48 kHz mono wavs were
encoded to AAC 96 kbps (`ffmpeg -ac 1 -ar 48000 -c:a aac -b:a 96k -movflags +faststart`).
AI-generated audio.
