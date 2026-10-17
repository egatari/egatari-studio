# Reference voices

The default voices. They are synthetic: no real person's voice was recorded or cloned, and they were not made to imitate any specific person or character.

| File | Role | Made with | Model license |
|---|---|---|---|
| `bob.wav` | Expert, Japanese | Irodori-TTS v4.1 Small reading a fixed Japanese text (below), cloned from a voice designed with Qwen3-TTS VoiceDesign (from a text description) | MIT (Irodori), Apache-2.0 (Qwen3-TTS) |
| `alice.wav` | Novice, Japanese | Irodori-TTS v4.1 Small reading the same text, cloned from a voice designed with Irodori-TTS (from a text description) | MIT |
| `bob_en.wav` | Expert, English | VoxCPM2 reading the "Please call Stella" paragraph, cloned from the Qwen3-TTS voice | Apache-2.0 |
| `alice_en.wav` | Novice, English | VoxCPM2, same text, cloned from the Irodori voice | Apache-2.0 |

Japanese text: 「きょうは、新しい研究の話を少しだけしましょう。データを集めて、ていねいに比べてみると、思いがけない違いが見えてきます。たとえば、雨の日と晴れの日では、駅前の人通りがおよそ三割も変わります。ちょっと意外ですよね。だからこそ、自分の目で確かめることが、いちばん大切なんです。」 Several takes were made and the best one was chosen by ear.

All files are 48 kHz mono at −20 LUFS (the TTS models expect 48 kHz; a 16 kHz reference made the mlx server read faster).

They may be used and redistributed with this project (MIT). Label audio made with them as AI-generated.

Put your own voices here as `<name>.wav` (and `<name>_en.wav` for English decks); other files in this folder are gitignored. Use only voices you have the right to use.

Tip for a phone recording (20–30 s, a quiet room without echo): convert it to 16 kHz and back to 48 kHz. This removes the compression noise above 8 kHz, and the cloned voice sounds clearer:

```bash
ffmpeg -i me.m4a -ac 1 -af "aresample=16000,aresample=48000:filter_size=64:cutoff=0.97" me.wav
```

For English decks, make `me_en.wav` by having VoxCPM2 read a fixed English text (such as the "Please call Stella" paragraph) with `me.wav` as the reference, a few times, and keep the best take: a Japanese reference makes the English sound accented.

---

既定の声。どれも合成した声で、実在の人の声を録ったりクローンしたりしたものではなく、特定の人やキャラクターに似せて作ったものでもない。上の表のモデルで作った（bob の元の声は Qwen3-TTS の VoiceDesign、alice の元の声は Irodori-TTS で、どちらも声の特徴を文章で指定して作った。その声をまねて、日本語は Irodori-TTS v4.1 Small に上の決まった文を、英語は VoxCPM2 に "Please call Stella" を読ませ、何回か作った中から耳で選んだ。Qwen3-TTS と VoxCPM2 は Apache-2.0、Irodori-TTS は MIT）。どれも 48 kHz・モノラル・−20 LUFS（TTS のモデルは 48 kHz を前提にする。16 kHz の参照音声だと mlx のサーバーで読む速さが変わった）。このプロジェクトと一緒に使い、配ってよい（MIT）。作った音声は AI で生成したものと分かるようにする。

自分の声は `<名前>.wav`（英語のデッキ用に `<名前>_en.wav`）としてここに置く。ほかのファイルは git 管理外。使う権利のある声だけを使うこと。

スマホで録った声（20〜30 秒、響きの少ない静かな部屋で）は、いったん 16 kHz に下げてから 48 kHz に戻すと、8 kHz より上の圧縮の雑音が落ちて、まねた声がクリアになる（コマンドは上）。英語のデッキ用の `<名前>_en.wav` は、`<名前>.wav` を手本に VoxCPM2 に決まった英文（"Please call Stella" など）を何回か読ませ、いちばん良いものを残して作る（日本語の参照音声のままだと英語が訛る）。
