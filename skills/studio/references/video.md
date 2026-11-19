Always reply in the language the user writes in.

# egatari-studio:studio：Egatari ファイルを動画にする

CLI 専用。音声の入った作業フォルダか Egatari ファイルを受け取り、音声は作らない。

コマンドは studio スキルの「コマンド：egatari」のとおり `npx egatari@0.6.x` で動かす（まだなら先に `npx egatari@0.6.x doctor`）。

1. `npx egatari@0.6.x doctor` の `ffmpeg` の行で ffmpeg があるか確認する。なければ、表示のインストールの方法か、Colab の動画のノート（エディタの「ファイル」→「エクスポート」→「動画（MP4）にする…」から開ける。.ega.html をアップロードして動かす）を案内する。
2. `npx egatari@0.6.x video <作業フォルダ|.ega.html>` を動かす（空白のあるパスは引用符で囲む）。作業フォルダならビルドしてから動画にする。出力は作業フォルダの `video/`、1 ファイルなら同じ名前の `.video` フォルダ（通しの動画は `full.mp4`）。背景の音楽を付けたいと言われたら `--music <音声ファイル>` を追加する（声の間は自動で下がり、終わりで消える。秒・拍の設定はない）。
3. 表示された出力先と結果を伝える。音声の追加・修正が必要なら [音声の手順](audio-local.md) を読む。
