# ギャラリー用の画像（教材の外）

- `host-page-example.png`：ライブのホストのページ（質問・わからない・投票の集計）。**架空の授業の例**。ギャラリーではそう書いて添える。
- 撮り方：egatari/live を手元だけで動かし（`.dev.vars.example` を `.dev.vars` に写して `npm run dev`、本番の live.egatari.org には触らない）、`EGATARI_STUDIO=<egatari-studio の場所> node scripts/live_host_shot.mjs <出力先>` を 127.0.0.1:8799 に向けて実行した。参加者の名前・質問・投票はすべて架空。撮影の後に `.dev.vars` を消した。
