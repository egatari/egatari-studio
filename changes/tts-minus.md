### Fixed

- TTS (`tts/yomi.py` and the editor's browser TTS): the minus sign `−` (U+2212) is read as マイナス; Irodori-TTS's text
  normalisation dropped it, so `−1` was read as 1. This changes the dictionary digest, so local TTS remakes every step once
- Reading dictionary: L殻, M殻, 送り仮名 and 濃い側, misread in a trial
- Docs (editor): the browser TTS uses seed 0 like the local mlx server, but its waveform is not the same
