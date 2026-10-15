# 開発サーバー（ブラウザで直す）

HTML の原稿を手で開かずに、ブラウザの上で文言・口述原稿を直し、Claude への指示を残すための小さなサーバー。
VS Code は要らない。待ち受けは 127.0.0.1 だけ。

## 起動

```bash
node server/dev.mjs examples/minimal/deck.html            # http://127.0.0.1:5173/
npm run dev -- path/to/deck.html --port 5174 --theme tml
```

原稿のフォルダ（deck.html、narration.md、timeline.json、macros.tex、data/、figs/、components/、audio/manifest.json）と、
リポジトリの kit/、components/、themes/ を見張り、変われば組み直して画面を読み込み直す（スライドと段階はそのまま）。
組み立てに失敗したときは、失敗の内容を画面に出す。直して保存すれば戻る。
`?presenter=1`、`?mode=lecture` などはそのまま使える。音声は `/deck/audio/…` から読む。

## 操作

| 鍵 | すること |
|---|---|
| `e` | 編集モードの入り切り。直せる要素に枠が出る。**ダブルクリック**で原稿（HTML と `\( \)` の式）を開き、⌘/Ctrl+Enter で保存、Esc で取消 |
| `n` | 口述原稿の引き出し（右）。今の段階の発言を直す（話者 Expert / Novice、発言の追加・削除・順番）。`{cue}` `{φ\|ファイ}` はそのまま書く。下に次の段階を表示 |
| `c` | Claude への指示の一覧（未対応のもの）。クリックでそのスライドへ、「解決」で対応済み |
| Alt（Option）+クリック | その要素について Claude への指示を残す |

矢印・Space・p・a・l などの発表の操作は、入力欄の外ではいつもどおり効く。
保存した時点で原稿が別の所で変わっていたら（ハッシュが合わない）、保存せずに「原稿が変わっています。再読み込みしてください」と出す。

## 書き換えるファイル

- `deck.html`：ダブルクリックで直した要素の中身だけを置き換える
- `narration.md`：その段階の行（`[k] …` とその続きの行）だけを置き換える。なければスライドの順・段階の順の位置に足す。
  ほかの行（コメントを含む）は元のまま。発言を全部消すとその段階の行を消す
- `comments.json`：Claude への指示 `[{id, created, key, range, quote, comment, status}]`（key は `スライドの鍵:段階`、range は deck.html の位置）
- `.cache/edits/`：書き換える前の deck.html・narration.md の写し（新しい 30 個）

## Claude Code への頼み方

「コメントを反映して」と頼む。Claude Code は `comments.json` の `status: "open"` を読み、`key`・`quote`・`range` を手がかりに
deck.html（または narration.md・部品）を直し、終わったものを `"status": "resolved"` にする。
range は指示を残した時点の位置なので、ずれていれば quote で探す。サーバーが動いていれば、直した結果はすぐ画面に出る。
