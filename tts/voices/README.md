# Reference voices

The default voices. They are synthetic: no real person's voice was recorded or cloned, and they were not made to imitate any specific person or character.

| File | Role | Made with | Model license |
|---|---|---|---|
| `bob.wav` | Expert, Japanese | Qwen3-TTS VoiceDesign (a voice designed from a text description) | Apache-2.0 |
| `alice.wav` | Novice, Japanese | Irodori-TTS | MIT |
| `bob_en.wav` | Expert, English | VoxCPM2, cloned from `bob.wav`, reading the "Please call Stella" paragraph | Apache-2.0 |
| `alice_en.wav` | Novice, English | VoxCPM2, cloned from `alice.wav`, same text | Apache-2.0 |

All files are 48 kHz mono (the TTS models expect 48 kHz; a 16 kHz reference made the mlx server read faster).

They may be used and redistributed with this project (MIT). Label audio made with them as AI-generated.

Put your own voices here as `<name>.wav` (and `<name>_en.wav` for English decks); other files in this folder are gitignored. Use only voices you have the right to use.

---

既定の声。どれも合成した声で、実在の人の声を録ったりクローンしたりしたものではなく、特定の人やキャラクターに似せて作ったものでもない。上の表のモデルで作った（bob は Qwen3-TTS の VoiceDesign で、声の特徴を文章で指定して作った。Qwen3-TTS と VoxCPM2 は Apache-2.0、Irodori-TTS は MIT）。どれも 48 kHz・モノラル（TTS のモデルは 48 kHz を前提にする。16 kHz の参照音声だと mlx のサーバーで読む速さが変わった）。このプロジェクトと一緒に使い、配ってよい（MIT）。作った音声は AI で生成したものと分かるようにする。

自分の声は `<名前>.wav`（英語のデッキ用に `<名前>_en.wav`）としてここに置く。ほかのファイルは git 管理外。使う権利のある声だけを使うこと。
