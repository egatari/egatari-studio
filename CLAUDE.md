# CLAUDE.md

動きのある HTML の学術スライド（Marp スキルシリーズに並ぶ html 版）。概要は README.md（英語）と README.ja.md。

## 守ること

- `docs/contract.md`（英語）と `docs/contract.ja.md`（日本語）が約束事の正本。実行系・部品・口述原稿・タイムラインを変えるときは先にこれを直す（両方を揃える）。`docs/dev-server` と `docs/video` も同じく `.md` が英語、`.ja.md` が日本語
- 画面は `DECK.seek(i, k, t)` だけで決まる。部品の中で実時間の時計・`setTimeout`・`requestAnimationFrame`・シードのない乱数を使わない（動画の書き出しが壊れる）
- 色は直接書かない。テーマの変数（`--term` `--emph` `--muted` `--fg` `--accent2` `--line` `--series-*`）だけを使う
- 機関に依存するもの（基調色・ロゴ）は `themes/<名前>/` の中だけに置く（将来、中立テーマだけの汎用版を公開できるように）
- スライドだけの使い方（build・check・開発サーバー・PDF）は TTS なしで完結させる。`kit/` `server/` から `tts/` `render/` を読み込まない。`audio/` や `voice.json` がなくても動くこと
- 組み立ての本体は `kit/core/`（`build-core.mjs` `narration-core.mjs`）で、Node とブラウザの編集アプリ（`app/`）が共有する。ここでは `node:` の読み込み・`fs`・`process` を使わない（読み書きは渡された env を通す）。`kit/build.mjs` を変えたら、字の絞り込みを切った出力が編集アプリと同じか `node tools/test-app.mjs` で確かめる
- 持ち運べる 1 ファイル（`--portable`、`kit/core/portable.mjs`）の形式の名前・拡張子・id・MIME・Schema の場所は `kit/core/format.mjs` だけに書く（名前が変わったらそこと `vendor/<名前>-spec` の同期だけで済むように）。README・docs・CHANGELOG では「持ち運べる 1 ファイル」と書き、形式の名前（Egatari）は仕様へのリンクと一緒に、紹介するところでだけ使う（コードでは format.mjs から読む）。Schema は写し（vendor）から読み、試験でネットワークを使わない
- ブラウザは `kit/browser.mjs` の `launch()` で起動する（`CHROME_PATH` → Chrome → Playwright の Chromium の順）
- TTS は `tts/` の中で完結させる（`uv run --project tts python tts/synth.py`）。外のリポジトリに依存しない。設定は環境変数（`IRODORI_URL` `IRODORI_REF_DIR` `MOTION_YOMI`）と CLI で、個人のパスやアドレスをリポジトリに書かない
- `tts/core.py`（合成・無音除去・音量・結合）と `tts/yomi.py`（読み辞書の規則）を変えると音声が変わる。yomi.py は digest に入るので、変えると全段階が作り直しになる
- canon（TML 研究室の講義配信システム。`CANON_DIR` で場所を渡す）への出力は 1 段階 = 1 コマ = 1 チャプター。話者は `Expert:` / `Novice:` だけ（ほかは黙って捨てられる）

## 確かめ方

- `node kit/build.mjs examples/minimal/deck.html` → `node tools/smoke.mjs <out.html> <dir>`（タイムラインとスクリーンショット）
- `node tools/shot.mjs <out.html> <png> <i> <k> [mode]` で 1 枚
- `node kit/check.mjs <deck.html>` が error 0
- 画面の確認は必ずスクリーンショットを目で見る
