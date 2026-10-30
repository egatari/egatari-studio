# CLI：音声を付ける

コマンドを動かせるときだけ読む。チャットの利用者には Studio の音声の板を案内する。

## Studio の中で作る

作業フォルダか 1 ファイル（.ega.html）を Studio で開き、音声の板の「この PC で AI 音声を作る」を選ぶ。ブラウザの中の Irodori が使える。声は同梱の合成音声 bob・alice。作った音声を保存する。

## 任意：Apple シリコンの Mac で手元のサーバーを使う

uv を用意し、次の 1 行で mlx-audio のサーバーを入れて起動する（モデルの初回取得には通信が要る）。

```bash
uv run --with 'mlx-audio[server]' python -m mlx_audio.server --host localhost --port 8882 # IRODORI_URL の既定 http://localhost:8882 に合わせる
```

起動した端末は開いたままにする。別の端末で `<repo>`（プラグインの根）から動かす。声は `tts/voices/` に同梱の bob（1 人、または Expert）と alice（Novice）。掛け合いは頼まれたときだけ。

```bash
uv run --project tts python tts/synth.py <作業フォルダ> --voices expert=bob,novice=alice
node kit/build.mjs <作業フォルダ>/deck.html
node kit/build.mjs <作業フォルダ> --portable
```

音声のあとに組み直して長さと cue を反映する。別のサーバーを使うなら `IRODORI_URL` で指定する。同じ PC の同梱の声を使うので、個人の常駐サービスや参照音声の設定は要らない。音声を聞き、読み間違いは台本の `{表示|読み}` か読み辞書で直す。
