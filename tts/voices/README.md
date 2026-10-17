# Reference voices

The default voices. They are synthetic: no real person's voice was recorded or cloned.

| File | Role | Made with | Model license |
|---|---|---|---|
| `alice.wav` | Expert, Japanese | Qwen3-TTS | Apache-2.0 |
| `bob.wav` | Novice, Japanese | Irodori-TTS | MIT |
| `alice_en.wav` | Expert, English | VoxCPM2, cloned from `alice.wav`, reading the "Please call Stella" paragraph | Apache-2.0 |
| `bob_en.wav` | Novice, English | VoxCPM2, cloned from `bob.wav`, same text | Apache-2.0 |

They may be used and redistributed with this project (MIT). Label audio made with them as AI-generated.

Put your own voices here as `<name>.wav` (and `<name>_en.wav` for English decks); other files in this folder are gitignored. Use only voices you have the right to use.

---

既定の声。どれも合成した声で、実在の人の声を録ったりクローンしたりしたものではない。上の表のモデルで作った（Qwen3-TTS と VoxCPM2 は Apache-2.0、Irodori-TTS は MIT）。このプロジェクトと一緒に使い、配ってよい（MIT）。作った音声は AI で生成したものと分かるようにする。

自分の声は `<名前>.wav`（英語のデッキ用に `<名前>_en.wav`）としてここに置く。ほかのファイルは git 管理外。使う権利のある声だけを使うこと。
