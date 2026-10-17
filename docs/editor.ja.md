# 編集アプリ（インストール不要）

[English](editor.md) | 日本語

デッキのフォルダを直接開き、[開発サーバー](dev-server.ja.md)と同じこと（プレビュー、スライドの上での原稿・口述原稿の編集、Claude への指示）をするウェブページ。インストールもターミナルも要らない。

- **ブラウザ：** パソコンの Google Chrome か Microsoft Edge（Windows・macOS・Linux・ChromeOS）。File System Access API（`showDirectoryPicker`）を使うので、Safari と Firefox では動かない（最初の画面にそう出る）
- **通信：** アプリ自身の読み込みのほかは無い。デッキのフォルダはブラウザの中で読み書きし、どこにも送らない

## アプリの入手

| 形 | 開き方 | 備考 |
|---|---|---|
| 配信 | <https://moiku.github.io/motion-academic-slides/editor/> | `main` から `.github/workflows/pages.yml` で公開する。字はデッキが使う分だけ読む |
| 1 ファイル | `npm run build:app` のあと `dist/editor.html` をダブルクリック | 約 10 MB（字を全部入れてある）。Chrome・Edge なら `file://` で動く。このファイルを人に渡してもよい |
| 自分のサーバー | `npm run build:app` のあと `dist/editor/` を静的に配る | どこでもよい（https か `http://localhost`） |

`npm run build:app`（`node tools/build-app.mjs [--out dist] [--no-single]`）は先に `npm ci` が要る（版を固定した開発用の依存 esbuild を使う）。

## 使い方

1. **デッキを開く。** デッキのフォルダ（`deck.html` の入ったフォルダ。`deck.html` がなければフォルダの最上位の最初の `.html`）を画面に落とすか、「フォルダを開く」を押す。そのフォルダを編集してよいか、ブラウザが 1 回たずねる
   - **新しいデッキ**：`npm run new` と同じ雛形から `deck.html` と `narration.md` を作る（タイトル・言語・テーマ）。空のフォルダを選べばそこに、空でなければ中にタイトルの名前のフォルダを作る
   - **最近開いたフォルダ**：最初の画面に並ぶ（ブラウザがフォルダのハンドルを IndexedDB に残す。中身は残さない）。開き直すとき、ブラウザがもう一度許可を求める
2. **直す。** キーは開発サーバーと同じ（道具の列にもボタンがある）

   | キー | すること |
   |---|---|
   | `e` | 編集モード。枠の出た要素を**ダブルクリック**すると原稿（HTML と `\( … \)` の式）が開く。⌘/Ctrl+Enter で保存 |
   | `n` | 表示中の段階の口述原稿の引き出し（話者、発言の追加・削除・並べ替え） |
   | Alt+クリック（Mac は ⌥ option+クリック） | その要素について Claude への指示を残す（`comments.json`） |
   | `c` | 未対応の指示の一覧。クリックでそのスライドへ、「解決」で対応済み |

   開発サーバーと同じく、プレビューを組んだ後にファイルが変わっていれば（原稿の hash・口述原稿の版が合わなければ）保存しない。読み込み直してからもう一度
3. **Claude Code と一緒に。** Claude Code（やほかのエディタ）がフォルダを変える間も開いたままでよい。約 1.5 秒ごとにファイルを見て、変わったら組み直し、同じスライド・段階のままプレビューを読み込み直す。原稿の編集や口述原稿の引き出しで入力中なら、保存か取消まで待つ。組み立てに失敗したら、直るまでプレビューの上にエラーを出す
4. **発表する・渡す。** 道具の列から
   - **簡易チェック**：`npm run check` の一部をプレビューの中で行う（はみ出し・文字の大きさ・タイトルと結論の字数・口述原稿の抜け・パレットのコントラスト）。結果をクリックでそのスライドへ。目安であって全部の検査ではない：部品の再現性・タイムライン・モーフ・読み上げは見ない。画面の大きさが違うので、数値がコマンドの検査とわずかに違うことがある
   - **HTML を書き出す**：編集の仕掛けを除いて組み、1 つの HTML に保存する（保存先をたずねる）。ダブルクリックでどこでも発表できる
   - **印刷 / PDF**：デッキをブラウザの印刷にかける（`tools/pdf.mjs` と同じく、各スライドの最終状態を 1 ページずつ。「PDF に保存」を選び、「背景のグラフィック」を入れる）
   - **発表者ビュー**（デッキの `p` でも）：今の画面・次の段階・口述原稿（カンペ）・経過時間・描く道具の窓。編集アプリの窓のプレビューを操作する
   - **全画面**：プレビューを画面いっぱいにする（投影用）

## 書き換えるファイル

開発サーバーとまったく同じ（[dev-server.ja.md](dev-server.ja.md) の「書き換えるファイル」）。どれも選んだフォルダの中

- `deck.html`：編集した要素の中身だけ
- `narration.md`：編集した段階の行だけ（注釈やほかの行はそのまま）
- `comments.json`：Claude への指示 `[{id, created, key, range, quote, comment, status}]`
- `.cache/edits/`：書き換える前の `deck.html`・`narration.md`（新しい 30 個）
- 「新しいデッキ」では `deck.html` と `narration.md`、「HTML を書き出す」では選んだファイル

## できないこと

- **Chrome・Edge だけ。** スマートフォンのブラウザもフォルダを開けない
- **コマンドで行うもの：** 読み上げ音声（TTS）・動画・教材バンドル（`tts/` `render/`）、全部の検査（`npm run check`）、`tools/pdf.mjs`。フォルダの音声（`audio/`）は読まない：自動再生は音声がないときと同じ既定の秒数
- **書き出しが大きい。** コマンドの build は fonttools で和文の字を絞り込める（`node tools/get-fonts.mjs`）が、ブラウザではできないので、使う字を含む分割ファイルをそのまま埋め込む（TTF がないときのコマンドと同じ）。`examples/minimal` は編集アプリで約 2.0 MB、絞り込んだ `npm run build` で 0.7 MB。見た目は同じ
- **同梱のもの。** リポジトリの部品（`components/`）・テーマ（`themes/`）・実行系（`kit/`）は、アプリを組んだときのもの。デッキのフォルダの中の部品とテーマ（`components/<名前>/index.js`、`themes/<名前>/`）は、いつもどおりフォルダから読む
- **読まないもの：** `.` で始まる名前と、`out/` `audio/` `video/` `bundle/` `node_modules/` のフォルダ（3000 ファイル・10 階層まで）
- **デッキの中からの通信は止まる。** 外部の画像やスクリプト（`https://…`）はプレビューに出ない（build はもともと警告する）

## 仕組みと安全

- **組み立ては 1 つ。** `kit/core/build-core.mjs` が組み立ての本体（注記・取り込み・KaTeX・部品・口述原稿・注目の演出・秒数・テーマ・ファイルの埋め込み・字）で、Node に依存せず、渡された口を通してだけファイルを読む。`kit/build.mjs` は Node のファイル（と fonttools の絞り込み・ffmpeg）を、編集アプリは選んだフォルダと同梱の kit・部品・テーマ・KaTeX・字を渡す。字の絞り込みを切れば、両方が 1 バイトも違わない HTML を出す（`tools/test-app.mjs` が `examples/minimal` と `examples/tmlr2026-calibration` で確かめる）。口述原稿の解析と書き換え（`kit/core/narration-core.mjs`）と新しいデッキの雛形（`kit/templates/new-deck.mjs`）も同じく共有する
- **編集の画面も 1 つ。** `server/client.js` は「運び手」を通して話す。開発サーバーでは `fetch` と Server-Sent Events、編集アプリでは親の画面への `postMessage`。編集アプリは同じ問い合わせ（`/__dev/source` `/__dev/edit` `/__dev/narration` `/__dev/comment` …）に、開いたフォルダで答える（`app/devapi.js`）
- **デッキは砂場の中で動く。** プレビューは `allow-same-origin` を付けない `<iframe sandbox="allow-scripts allow-modals">` なので、デッキは origin を持たない。編集アプリの画面・保存領域・フォルダのハンドルに届かず、送れるのはメッセージだけで、編集アプリは送り元の窓と形を確かめ、開いたフォルダについてだけ答える。`allow-modals` は `confirm`（口述原稿の変更を捨てるか）と印刷のため。ページの Content-Security-Policy（デッキも受け継ぐ）はアプリ自身の読み込みだけを許す（部品が `new Function` で式を作る（`m-sweep f="…"` など）ので `'unsafe-eval'` は許す）。発表者ビューは編集アプリが開く窓で、その中のデッキもまた砂場の iframe。やり取りは編集アプリが中継する
- **触るのは選んだフォルダだけ**で、ブラウザの許可を得てから
- **分かっている弱点（v0.3 まで）：デッキ自身のコードがデッキを書き換えられる。** 編集の画面は砂場の中のデッキの側で動き、編集アプリは「プレビューから来た」ことしか確かめていない。なので、デッキの中のスクリプトや部品も同じ依頼を送って、開いたフォルダの `deck.html`・`narration.md`・`comments.json` を書き換えられる（ほかのファイルには届かない。控えは `.cache/edits/` に残る）。信頼できるデッキだけを開くこと。v0.3 で編集の画面を編集アプリの側に移し、プレビューからは「どこを直すか」を指すことしかできないようにする

## GitHub Pages で配る

`.github/workflows/pages.yml` が `node tools/build-app.mjs --out _site` で組み、GitHub Pages に置く（編集アプリは `/editor/`、1 ファイル版は `/editor.html`）。Pages を設定するまでは何もしない

1. Settings → Pages → Build and deployment → Source を **GitHub Actions** にする
2. Settings → Secrets and variables → Actions → Variables に `EDITOR_PAGES` = `true` を足す（なければ push で置く手順を飛ばすので、Pages を有効にする前に失敗しない）
3. 1 回走らせる（Actions → pages → Run workflow）か、`main` に push する

## 確かめ方

`node tools/test-app.mjs [作業用のフォルダ] [--shots 画像のフォルダ]`（`npm test` に入っている）は、作業用のフォルダに編集アプリを組んで 127.0.0.1 で配り、ブラウザの OPFS（origin-private file system）にデッキのフォルダを作って `window.__APP_TEST_OPEN(handle)` で開く。同じ HTML になること・原稿の編集・口述原稿の引き出し・指示・外での変更・組み立ての失敗・簡易チェック・書き出し・発表者ビュー・英語の画面・`file://` の 1 ファイル版と、コンソールのエラーが無いことを確かめる。

## 画面の言葉

ふだんはブラウザの言語（日本語か英語）に合わせる。右上の **English / 日本語** のボタンで切り替えるか、`…/editor/?lang=en`・`?lang=ja` で開く。選んだ言葉は覚えておき、デッキを開いたまま切り替えても同じフォルダを開き直す。スライドの中の編集の道具（編集モード・口述原稿の引き出し）は、デッキの言語（`<html lang>`）に合わせる。
