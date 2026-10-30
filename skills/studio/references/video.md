Always reply in the language the user writes in.

# egatari-studio:studio：教材を動画にする

CLI 専用。音声の入った教材を受け取り、音声は作らない。

`<repo>` はstudio スキルの SKILL.md のあるフォルダから 2 つ上（プラグインの根）。初回は `<repo>` で `npm ci` を案内する。

1. `ffmpeg -version` で ffmpeg があるか確かめる。なければ [Colab の案内](../../../colab/) を渡す。書き出し用のノートがまだなければ、その旨を伝える。
2. `node <repo>/tools/video.mjs <作業フォルダ|.ega.html>` を動かす（空白のあるパスは引用符で囲む）。
3. 表示された出力先と結果を伝える。音声を足す・直す必要があれば egatari:make に戻る。
