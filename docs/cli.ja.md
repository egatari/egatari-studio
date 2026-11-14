<!-- i18n: pair=cli.md sha256=d116a68c13660c3a -->
# ほかのコマンドと設定

[English](cli.md) | 日本語

[README](../README.ja.md) の「npm で使う（clone しない）」に続く、`egatari` コマンドの細かい話。

ほかのコマンド（`ids`・`ids-of`・`sheet`・`comment-shots`・`portable`・`video`・`tts`）は `npx egatari --help` に出る。`npx egatari ids-of <file.ega.html> […]` は、ファイルごとに 1 行で（タブ区切り。`--json` で JSON）、`docId`、ファイルの原稿から計算し直した `sourceSha256`（原稿のバージョン。音声と組んだ部分は含まない。ファイルに書かれた値と違えば stderr に警告）、ファイル全体の SHA-256（ファイルそのものを表す。配布や LMS への登録の照合用）を出す。誰が公開したかは署名（形式 §10、まだ実装していない）の役目。`npx egatari video <作業フォルダ | .ega.html>` は組んでから、今ある音声のまま動画にする（ffmpeg が要る）。相対パスは今いるフォルダから解く。組み立てが埋め込む既定の字体は包みに入っている（`get-fonts` は要らない）。同梱のテーマの字体（`asagi` の Zen Maru Gothic、`bengara` の Fraunces）も入っているので、同梱のテーマはどれも `npx egatari` だけで組める。教材の CSS や自分のテーマだけが名指せるほかの選べる字体（Klee One など）は、別の包み `@egatari/fonts-extra` にある（`npm i -D @egatari/fonts-extra`、または `npx -p egatari -p @egatari/fonts-extra egatari …`。要る教材なら `egatari build` と `check` が知らせる）。パーツライブラリの写しは、組み立てが読む `index.js` と使用条件だけを入れる（README・見本・変更の記録は入れない。`egatari doctor` が `index.js` を `components.lock.json` と manifest のファイルごとの sha256 で確かめる）。TTS の既定の声は初めての `egatari tts` で取り寄せる（[README](../README.ja.md#requirements) の「要るもの」）。`egatari tts` は uv で `tts/synth.py` を動かし、Python の環境を利用者のキャッシュのフォルダに作る（別の場所にするには `UV_PROJECT_ENVIRONMENT`）。
