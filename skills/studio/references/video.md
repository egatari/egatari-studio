Always reply in the language the user writes in.

# egatari-studio:studio：教材を動画にする

CLI 専用。音声の入った教材を受け取り、音声は作らない。

コマンドは studio スキルの「コマンド：egatari」のとおり `npx egatari@0.6.x` で動かす（まだなら先に `npx egatari@0.6.x doctor`）。

1. `npx egatari@0.6.x doctor` の `ffmpeg` の行で ffmpeg があるか確かめる。なければ、表示の入れ方か [Colab での動画書き出しの案内（#131）](https://github.com/egatari/egatari-studio/issues/131) を渡す。書き出し用のノートがまだなければ、その旨を伝える。
2. `npx egatari@0.6.x video <作業フォルダ|.ega.html>` を動かす（空白のあるパスは引用符で囲む）。作業フォルダなら組んでから書き出す。出力は作業フォルダの `video/`、1 ファイルなら同じ名前の `.video` フォルダ（通しの動画は `full.mp4`）。
3. 表示された出力先と結果を伝える。音声を足す・直す必要があれば [音声の手順](audio-local.md) を読む。
