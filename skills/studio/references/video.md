Always reply in the language the user writes in.

# egatari-studio:studio：教材を動画にする

CLI 専用。音声の入った教材を受け取り、音声は作らない。

コマンドは studio スキルの「コマンド：egatari」のとおり `npx egatari@0.6.x` で動かす（まだなら先に `npx egatari@0.6.x doctor`）。

1. `npx egatari@0.6.x doctor` の `ffmpeg` の行で ffmpeg があるか確かめる。なければ、表示の入れ方か、Colab の動画のノート（エディタの「ファイル」→「エクスポート」→「動画（MP4）にする…」から開ける。.ega.html を上げて動かす）を案内する。
2. `npx egatari@0.6.x video <作業フォルダ|.ega.html>` を動かす（空白のあるパスは引用符で囲む）。作業フォルダなら組んでから書き出す。出力は作業フォルダの `video/`、1 ファイルなら同じ名前の `.video` フォルダ（通しの動画は `full.mp4`）。背景の音楽を付けたいと言われたら `--music <音声ファイル>` を足す（声の間は自動で下がり、終わりで消える。秒・拍の設定はない）。
3. 表示された出力先と結果を伝える。音声を足す・直す必要があれば [音声の手順](audio-local.md) を読む。
