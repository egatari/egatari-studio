---
name: studio
description: リポジトリで Egatari の作業フォルダの品質チェック・id の付与・ビルド・Egatari ファイルの作成・開発サーバーのコメント反映・ローカルの音声作成・動画化・新しいパーツの作成を行う。「品質チェックして」「ビルドして」「Egatari ファイルにして」「コメントを反映して」「動画にして」「パーツを作って」「この図をパーツにして」で使う。Use for checking and building Egatari working folders locally, applying comments, adding local audio, exporting video and writing parts.
---

Always reply in the language the user writes in. Write slides and narration in the file's language.

# egatari-studio:studio：作業フォルダをローカルで確認してビルドする

書き方の決まりは `egatari:make` に従う（先に読む）。make をインストールしていなければ、Claude Code は `/plugin install egatari@egatari`、Codex は `codex plugin add egatari@egatari` を案内する。

<!-- generated: instruction-version -->
**指示のバージョン：1100b582**
**スキルのバージョン：0.6.17**
<!-- /generated: instruction-version -->

make の「スキルのバージョン」の行（前のバージョンでは「スキルの版」）と違えば、両方のプラグインを更新するよう利用者に伝える。

インストール：

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
/plugin install egatari-studio@egatari
```

Codex へのインストール（Codex のターミナルで）：`codex plugin marketplace add egatari/egatari-studio`、`codex plugin add egatari@egatari`、`codex plugin add egatari-studio@egatari`。

インストールしたら、自動更新を有効にするよう利用者に依頼する。スキルの指示と品質チェックは Studio のバージョンごとに変わる。Claude Code では `/plugin` → Marketplaces → egatari → Enable auto-update（公式でないマーケットプレイスは、初めは自動更新が切れている）。Codex では Studio のリリースのたびに `npx egatari@0.6.x skills update`。

更新は、Claude Code では `/plugin update egatari-studio@egatari` と `/plugin update egatari@egatari`。Codex では `codex plugin marketplace upgrade egatari` のあと `codex plugin add egatari-studio@egatari` と `codex plugin add egatari@egatari` をもう一度。どちらのツールでも、ターミナルで `npx egatari@0.6.x skills update` を実行すると、インストールしてあるツールすべてを更新する。更新したらツールを再起動する。

必要な作業の参照だけ読む：

- [音声を付ける](references/audio-local.md)
- [動画にする](references/video.md)（既存の音声を使う）
- [パーツを書く・修正する・提案する](references/parts.md)

CLI では R-output の灰色の枠（コードブロック）の代わりに作業フォルダへ書き、画像・JSON・macros.tex も同梱できる。

## コマンド：egatari（npm の包み）

コマンドはすべて npm の包み egatari で動かす：`npx egatari@0.6.x <コマンド>`（Studio の 0.6 系にバージョンを固定する）。リポジトリの clone も `npm ci` も要らない。要るのは Node.js（と npm。Node.js に付いてくる）だけ。初めて動かすときに npx が包みを取ってくる。

`npx egatari@0.6.x` が使えない（ネットのないサンドボックスなど）ときは、インストールしてある Studio の `bin/egatari.mjs` を `node` で動かす（プラグインのコピーの中にある）。同じコマンドと引数で動く。

作業の初めに 1 回 `npx egatari@0.6.x doctor` を動かし、表示を読む：

- `npx` が見つからない、または `NG node`：Node.js が無いか古い。表示のバージョンのものを <https://nodejs.org/> からインストールするよう利用者に依頼する。インストールできなければ、書くのは `egatari:make` だけで済ませ、作業フォルダを Chrome か Edge の <https://studio.egatari.org/> で開くよう依頼する（品質チェック・ビルド・音声はそこでできる）
- `NG browser … なし / not found`：check・sheet・comment-shots・video に要る。表示の手順（Chrome か Edge をインストールする、`npx playwright-core install chromium`、または `CHROME_PATH`）を案内する
- 「ブラウザを起動できない：サンドボックスの外で動かす」（doctor の `NG browser … 起動できない`、または check の出力）：ブラウザはインストールされているがサンドボックスが止めている。Codex では、そのコマンド（`npx egatari@0.6.x check …` など）をサンドボックスの外で動かす許可を利用者に求める。ブラウザをダウンロードしない・インストールし直さない。品質チェックの代わりを自分で書かない。許可が得られなければ、`check --no-browser` で原稿だけの検査をし、見た目と動きの検査をしていないことを利用者にそのまま伝える
- `-- uv`：音声（`tts`）にだけ要る。`-- ffmpeg`：動画（`video`）にだけ要る。その作業をするときに、表示のインストールの方法を案内する
- 包みを取れない（ネットに接続できないなど）ときは、出た表示をそのまま利用者に見せる
- `ok   skills   指示のバージョン …（Studio X.Y.Z）`（前のバージョンの egatari では `指示の版 …`）：この行の Studio のバージョンと、上の「スキルのバージョン」の行のバージョンを比べる（バージョンは数で比べる。0.6.10 は 0.6.9 より新しい）。Studio のバージョンのほうが新しいときだけ、次の 1 行を伝え、作業は止めずに続ける。伝えるのは 1 回の会話で 1 回だけ（make スキルと合わせて 1 回）。<バージョン> はスキルのバージョン。同じバージョンか、スキルのほうが新しいときは何も言わない
  - Claude Code：「Egatari のスキルが古いバージョン（<バージョン>）です。/plugin で更新できます（Marketplaces → egatari → Enable auto-update で自動に）。」
  - Codex：「Egatari のスキルが古いバージョン（<バージョン>）です。`npx egatari@0.6.x skills update` で更新できます。」

同梱のファイル（パーツの一覧・パーツの README・規約）は、プラグインのルート `<root>`（この SKILL.md のあるフォルダから 2 つ上）にあり、読み込むだけ。`<root>` でコマンドを動かさない。作業フォルダ `<deck>` は `<root>` の外に置く。

## CLI：作業フォルダ

スライドと台本は 1 つの作業フォルダにまとめる。

```
<deck>/
  deck.html       スライド（テンプレートは `npx egatari@0.6.x new <deck>` が作る）
  narration.md    台本（人が読んで編集する。テンプレートも new が作る）
  egatari.json    ファイルの設定。new が {"componentsCatalogue": "2"}（パーツライブラリ 2 でビルドする）で作る。自分でフォルダを作るときも同じものを書く。今ある作業フォルダの値は変えない
  data/  figs/    検算済みスクリプトの出力（JSON）、matplotlib の SVG
  scripts/        数値と図を作るスクリプト（uv で実行）
  macros.tex      論文の \newcommand（あれば）
```

## CLI：構成案から配布まで

1. **材料を読む**：TeX の原稿（と、あればレジュメ）。発表時間、出口（学会発表／授業）、テーマ（同梱で選べるのは `default`（藍）・`sumi`（墨）・`kokugo`（国語）・`tokiwa`（常盤）・`murasaki`（江戸紫）・`kogecha`（焦茶）・`asagi`（浅葱）・`bengara`（弁柄）。報告・提案・ピッチなら `sumi`、国語なら `kokugo`、ほかは `default`。`business` は新しいファイルには使わない。機関のロゴ入りのテーマなど同梱でないものは、利用者のテーマのフォルダ（`EGATARI_THEMES`・`~/.egatari/themes`）か作業フォルダの `themes/<名前>/` に置いてあるものを名前で選ぶ。見つからなければビルドが `theme not found` と警告して `default` でビルドするので、その警告が出たら利用者に置き場所を確認する）を確認する。分からなければ聞く。話者は既定で 1 人（掛け合いは依頼されたときだけ。R-dialogue）
2. **構成案を文字で書いてユーザーに見せる**（ここが一番大事。TeX しかないときは、レジュメの役割をここで果たす）
   - 書く前に、パーツの一覧 `<root>/vendor/components/CATALOG.md` を全部読む（下の「CLI：パーツ」）
   - 形：番号付きの並びで、1 枚に 1 項目。各項目に、この順で書く：見出し／**伝えたいこと**／**おすすめのパーツ**（理由）／結論の行／材料
     - 見出し：章の見出し
     - 伝えたいこと：パーツライブラリの伝えたいこと（`<root>/vendor/components/manifest.json` の `purposes`）のどれか。名前はラベル `label.ja` があればそれ、なければ `ja`（比べる（量・特徴）・変化・内訳 など）。どれにも当たらなければ「なし（文と式）」
     - おすすめのパーツ（理由）：その伝えたいことに合うパーツ（`manifest.json` の `components.<名前>.purposes` にその伝えたいことがあるもの。`CATALOG.md` の内容で選ぶ）と、選んだ理由。**おすすめにする前に、必要な機能があるかを README で確認する**（例：`m-map-japan` で地方をまとめて塗れるか）。合うものがなければ「なし」か「新しい表現」（下の「CLI：パーツ」）。**操作できるパーツ**（manifest の `interactive` のとおり。例：`m-predict`）には「発表中に操作できる」と添える
     - **ツール**（manifest の `group` が `"tool"` のパーツ）は、授業の中に時間を区切る活動（グループワーク・演習・『3 分で考える』など）があるときだけおすすめに入れる。ファイル全体の長さ（「全体で 30 分」など）は当たらない
     - 数：利用者が書いた値か、スクリプトで出す値だけを書く。それ以外は「（値はスクリプトで出す）」と書き、構成案の段で数を作らない
   - パーツは**おすすめとして聞く**。例：「このスライドは年表のパーツ `m-timeline` がおすすめです。使いますか。ほかのパーツ・新しい表現・パーツなし（文と式）にもできます」。決めるのは利用者
   - 枚数の目安：話す部分は 1 分 ≒ 1 枚。活動（指示とタイマー）は、何分でも 1 枚と数える。1 枚に 8 行・100 字まで
   - 構成案の終わりに、ファイルの情報を 1 行で聞く。空なら何もしないことを見せる。例：「ファイルの情報：ライセンス（例：CC-BY-4.0）・著作権（例：© 2026 名前）・作成者。空なら書きません」。答えは `<deck>/egatari.json` の `metadata`（下の「CLI：ファイルの情報」）に書く。答えがなければ書かずに進み、最後のビルドで聞き直さない
   - 承認を得るまで HTML を書かない
3. **静的な形で書く**：`deck.html` をテンプレートから作り（`npx egatari@0.6.x new <deck> [--lang en|ja] [--theme 名前] [--title "…"]` で `deck.html` と `narration.md` のテンプレートができる。空でないフォルダには書かない）、ステップなしで全スライドを書く。`npx egatari@0.6.x check <deck>/deck.html` で品質チェック
4. **ステップと台本を一緒に書く**（egatari:make の共通の書き方）。ステップの順は話す順なので、台本を書きながら `data-step` を決める
   - スライドを追加したら、id を書かずに、書き終えたところで `npx egatari@0.6.x ids <deck>` を動かす（下の「CLI：id」）
5. **パーツ**（下の「CLI：パーツ」）。構成案で決めたスライドだけ。使うパーツの `README.md` と `demo.html` を読んでから書く。新しい表現を作ったら、パーツの候補として知らせる（下の「CLI：パーツ」）
6. **品質チェックを実行して修正する**：`npx egatari@0.6.x check <deck>/deck.html` のエラーが 0 になるまで（終了コード 2 は品質チェックが終わっていない＝ブラウザが起動できないか落ちた。「エラー 0」ではないので、ブラウザを修正して実行し直す）。ステップ 0 で見えている本文の一覧は必ず読む
7. **全スライドの最終ステップを 1 枚の画像で見る**：`npx egatari@0.6.x sheet <deck>`（出力は `<deck>/out/sheet.png`。`--cols 4`・`--width 640`・`--tiles`（1 枚ずつの PNG も書く））。品質チェックでは見えないもの（凡例の意味の取り違え、軸の端で切れた点、図と文の食い違いなど）がある。画像を読めるなら Read で開いて全スライドを見て、読めないなら利用者に確認を依頼する。修正したら撮り直す。**図のあるスライドは、先に図の決まり（例：染色体は細胞の中にある）を書き並べ、`npx egatari@0.6.x sheet <deck> --steps` のステップを横に並べた行（1 行 1 スライド）で 1 つずつ確認する。作り手の「確認しました」だけで終えない**
8. **見ながら修正する**：`npx egatari@0.6.x dev <deck>/deck.html` を動かし、表示されたアドレスを開くよう利用者に依頼する（止めるまで動き続けるので、別の端末かバックグラウンドで）。ユーザーはブラウザ上で文字・台本を編集し、Alt+クリック（Mac は ⌥ option+クリック）でコメントを保存する（編集モードの `m`（ペンのボタン、`d` でも開く）で、スライドに丸や矢印を描いてからコメントを書くこともできる：マーカー）。「コメントを反映して」と言われたら：
   - `<deck>/comments.json` の open を読む（`key` は `スライドの id:ステップ`、`range` は deck.html の位置、`quote` は要素の字の頭（点の近くの字があれば「近くの字 ｜ 要素の字」）、`pin` は押した点 `{x, y}`（スライドの座標 1280×720。ないものもある）、`strokes` はマーカーで描いた線 `[[[x, y], …], …]`（同じ座標の線の並び。1 つのコメントに何本でも。マーカーだけ。そのときの `pin` は全部の線の重心。前のコメントは 1 本だけの `stroke: [[x, y], …]` のこともあり、`strokes: [stroke]` と読む））
   - **`strokes`（か `stroke`）があるコメントは、描いた線（丸・矢印・下線）がコメントの指すもの**：丸の中・矢印の先・下線の上が対象で（線が何本もあれば、全部を合わせて読む：丸と矢印なら丸の中を矢印の向きへ、など）、`quote` と `range` は全部の線の重心の下の要素からとった手がかりにすぎない。comment-shots の画像（描いた線を赤で描いてある）を見て決める
   - **先に `npx egatari@0.6.x comment-shots <deck>` を動かし、画像を見る**（Read で開く）。`<deck>/.cache/comment-shots/<id>.png` が点の周りの切り抜き（2 倍）、`<id>-full.png` がスライド全体で、どちらにも赤い輪で点を描いてある。図・パーツへのコメントは、輪の所にある線・ラベル・語が対象。言葉だけで決めない
   - 修正したら、そのステップを撮り直して（同じコマンドに id を付ける）、修正できたかを目で確認する。終わったものを resolved にする
9. **Egatari ファイルにする**：`npx egatari@0.6.x build <deck> --portable` → `<deck>/<題名>.ega.html`（作業フォルダの最上位。書いた場所は表示される）。スライド・台本と音声（あれば）も入った Egatari ファイルで、どこでも再生でき、編集アプリ <https://studio.egatari.org/> で開いて編集し、音声を付け、保存し直せる（フォルダは要らない）。これを仕上がりとして渡す
   - 初めて作るときに `<deck>/egatari.json` にファイルの id（docId）ができるので、作業フォルダに保存しておく
   - ファイルの情報は構成案で聞いたものを使い、ここで止めて聞かない
   - 「再生専用」「生徒に配る」と言われたら、`npx egatari@0.6.x build <deck> --play-only` → `<deck>/<題名>.play.ega.html` も作る：編集できるスライドと台本を含まない再生専用。参加者（生徒など）に配布するのはこちら
   - 「ただの HTML にして」と言われたときだけ、`npx egatari@0.6.x build <deck>/deck.html` → `<deck>/out/deck.html`（単一の HTML。印刷で PDF）
10. **終わりの報告**：`.ega.html` のパス（再生専用も作ったならそのパスも）を書き、<https://studio.egatari.org/> で開くと編集や音声の追加ができると添える。ライセンスと著作権を聞いて答えがなかったときは、書かずに作ったことと、`egatari.json` の `metadata` に書いて作り直せば含まれることを添える

## CLI：品質チェック

`npx egatari@0.6.x check <deck>/deck.html` のエラーが 0 になるまで修正する。終了コード 2 は品質チェックが終わっていない印で、エラー 0 ではない。

品質チェックはヘッドレスブラウザを使う。ブラウザが起動できず終了コード 2 なら、品質チェックは終わっていない。『品質チェックは未完了』と伝え、サンドボックスの外で `check` を動かすよう利用者に依頼する。通ったとは書かない。全スライドの最終状態と図のステップを画像で確認する。対話型 AI ではコマンドを依頼せず、Studio の品質チェックと「AI への修正依頼をコピー」を案内する。

## CLI：id

初稿にはスライドの id を書かず、書き終えたら `npx egatari@0.6.x ids <deck>` で付ける。スライドを追加するたびに動かす。今ある id と台本の `{#…}` は保つ。

## CLI：本のあるファイル

本（`article.md` か `article/`）のある作業フォルダは、id とリンクの順番が大事。本の書き方は egatari:make の references/book.md。

1. 本・スライド・台本を書く（リンクはまだ書かない）。
2. `npx egatari@0.6.x ids <deck>`：スライドの id と節の id（`(sec-…)=`）を付け、本の読む順を `egatari.json` に書く。
3. リンクを書く：節の中の ``{step}`…<s-xxxxxx:k>` ``、スライドの `data-article="sec-…"`。
4. もう一度 `ids`（新しいリンクを `egatari.json` の `articleLinks` に記録する）。
5. 品質チェック（`npx egatari@0.6.x check <deck>/deck.html`）とビルド（`npx egatari@0.6.x build <deck>/deck.html`）。本は `out/deck.article.html` にも出る。縦書きの本は開いて確認する。
6. **書き終えてから** `npx egatari@0.6.x ids <deck> --confirm-links`：リンクした組を読み比べて合っていることを記録する。書いている途中で記録すると、編集するたびに「スライドと本が合っていないかもしれません」が出る（編集した後に出たら、読み比べてから記録し直す）。
7. Egatari ファイルにするとき（`--portable`）は、本・`references.json`・本の画像が中に含まれる。

`--portable` の `.ega.html` と `sheet` の画像は作業フォルダに書かれる。git に含めないなら `.gitignore` に追加する。

## CLI：テーマを作る（自分のテーマ）

機関の色やロゴでスライドをそろえたいと言われたら、同梱のテーマを受け継ぐ小さなテーマを作る。

1. **聞く**：テーマの名前（英小文字。`tml` など）、基調色（`--base`。1 色）、強調の色（なければ同梱の式から導く）、ロゴの画像（png・jpg・svg・webp。使ってよいかを確認する。機関のロゴは使用の条件がある）、置き場所（この作業フォルダだけ → `<deck>/themes/<名前>/`、自分のファイルすべて → `~/.egatari/themes/<名前>/`）。
2. **作る**：
   ```
   <名前>/
     theme.json   {"name": "<名前>", "extends": "default", "logos": ["logos/cover.png"]}
     tokens.css   :root{ --base: #0A2D92; --emph: #D7000F; --cover-bg: #F6F9F6; --logo-h: 128px; }
     logos/cover.png
     LICENSE      ロゴ・フォントの使用の条件（Egatari ファイルに一緒に含まれる）
   ```
   - 色は変数だけで決める（`docs/reference.ja.md`「テーマ」の変数の表：<!-- generated: doc reference.ja.md#テーマ -->https://github.com/egatari/egatari-studio/blob/v0.6.17/docs/reference.ja.md#テーマ<!-- /generated: doc -->）。箱の位置を動かす CSS は書かない（書くなら `metrics` を宣言する）。
   - フォントを替えるなら `theme.json` の `fonts`（Studio が含められる一覧から）。
   - 表紙の背景に画像を敷くには、画像をテーマのフォルダに置き、`tokens.css` で相対の `url()` を書く（例：`--cover-bg: url(cover.png) center/cover no-repeat;`）。ビルドが画像を埋め込み、テーマの hash と Egatari ファイルにも含まれる。テーマのフォルダの外のファイルは使えない（警告が出て拒まれる）。ないファイルは警告が出て `url()` のまま残る。ロゴは `theme.json` の `logos`。
3. **確認する**：サンプルを `--theme <名前>` でビルドし、`npx egatari@0.6.x check` の `textContrast` が出ないこと（役割の色と地のコントラスト 4.5:1）、表紙のロゴの大きさを目で見る。
4. **使う**：スライドは `<html data-theme="<名前>">`。Egatari ファイルにエクスポートすると、テーマ（と LICENSE）がファイルの中に含まれ、どこでも同じにビルドできる。
5. **Studio で使う**：テーマのフォルダを ZIP にして（`cd ~/.egatari/themes && zip -r <名前>.zip <名前>`）、編集アプリの「テーマを読み込む…」→「ZIP ファイルを選ぶ…」。Chrome・Edge ならフォルダのまま「フォルダを選ぶ…」でもよい。
6. 手本：作者のテーマ集（tml・tcue・wsd・ohte）。どれも `extends: default` に色とロゴだけ。

## CLI：ファイルの情報

題名は `<title>`、言語は `<html lang>`。ライセンス・著作権・作成者は `<deck>/egatari.json` の `metadata`（license・copyright・creators・attribution）。構成案のときに 1 行で聞き（「CLI：構成案から配布まで」の 2）、答えのあったものだけを書く。値を作らない。参加者の名前・成績・回答・顔写真・提出物は例にも入れない。必要な例は架空と書く。

## CLI：パーツ

パーツはパーツライブラリ（egatari/components）のリリースのコピー `<root>/vendor/components/` にある。**全部のパーツが使える**（標準・専門・特殊のパーツも、ツールも。対話型 AI への指示のように、プランや分野で絞らない）。

- 一覧：`<root>/vendor/components/CATALOG.md`（全部のパーツの内容・ステップの数・受け取る値）。構成案の前に全部読む。使うと決めたパーツは `README.md`（書き方・データの形・台本との合わせ方）と `demo.html`（動く例）を読む。置き場所は `<root>/vendor/components/sha256/<hash>/`：`<hash>` は `<root>/components.lock.json` の `components.<名前>.content` の、既定のバージョン（同じところの `default`）の値
- 分け方：パーツライブラリ 2.0 の manifest `<root>/vendor/components-2/manifest-<バージョン>.json`（バージョンは `<root>/components2.lock.json` の `default`）の `components.<名前>`
  - `tier`：`standard`（標準）・`specialized`（専門）・`extra`（特殊）。スキルではどれも使える
  - `set`：専門パーツのセット（例：`stats`・`data`・`math`・`maps`・`kokugo`・`english`・`music`・`business`・`tools`）。固定の分野一覧で絞らず、manifest の値を読む
  - `kind`：`element` はスライドに置くパーツ、`library` はほかのパーツが使うライブラリ
  - `display`：タグとは別の表示名。あれば利用者への名前に使う
  - `purposes`：そのパーツが合う伝えたいこと（`purposes` の `id`。名前は `purposes` の `ja`）
  - `interactive`：`true` なら操作できるパーツ。構成案で「発表中に操作できる」と添える
  - `group`：`"tool"` ならツール。授業の中に時間を区切る活動（グループワーク・演習・『3 分で考える』など）があるときだけ使う
- 使った例：`<root>/examples/minimal`（`m-sweep`）、`<root>/examples/pitch-fictional`（`m-bars` などビジネスのパーツ）、`<root>/examples/kokugo-kanbun`（`m-kanbun`・`m-menu`）
- **合うパーツがないとき**：伝えたいことに合うパーツがなければ、表現カタログ（egatari/components の docs/expression-catalogue.md。パーツライブラリのリポジトリを clone してあればその中、なければ <https://github.com/egatari/components/blob/main/docs/expression-catalogue.md>）を見て、新しい表現を作ってよい。作るのは、その作業フォルダだけのパーツ（`<deck>/components/<名前>/index.js`。[パーツを書く手順](references/parts.md)）か、インライン SVG と `data-step`。カタログを読めなければ、インライン SVG と `data-step` で描く。作ったら、構成案と終わりの報告で**パーツの候補**として知らせる（何を伝えるための表現か・どのスライドか・カタログのどの項目に近いか）。パーツライブラリへの提案は、利用者が依頼したときだけ（[パーツを書く手順](references/parts.md)）
- **数値は検算済みのスクリプトの出力だけを使う**。`scripts/` に Python（uv）で書き、`data/*.json` に出し、パーツの子に `<script type="application/json">{{JSON:x.json}}</script>` で渡す。見た目のために数値を作らない
- 図に matplotlib などのグラフを入れるときは、各軸にデータの範囲より余白を取る（`ax.margins(0.05)` など）。端の点がプロット領域で切れないようにする
- 動きは注意の誘導に限る。飾りの動きは付けない
- 静的な図は matplotlib の SVG（図の幅[in] = 表示幅[px] / 100、文字 18pt）を `{{FIG:名前}}` で

## CLI：音声を付ける

ローカルで付けるときは [音声の手順](references/audio-local.md) を読む。

## 動画にする

[動画の手順](references/video.md) を読む。既存の音声を使い、音声は作らない。

## パーツを書く・提案する

[パーツを書く手順](references/parts.md) を読む。

## CLI： 使い終わりの感想（フィードバックを送信）

ユーザーが「感想を送って」「フィードバックして」「不具合を報告して」と言ったとき、または長い作業の終わりで、ユーザーが前もって送ってよいと言っていたときに行う。勝手には送信しない。

1. この作業で困ったこと・不具合・わかりにくかった手順・よかった点を、箇条書きで短くまとめる（何をして、何が起きて、どうなってほしかったか）
2. **私的な内容を入れない**：スライドの本文・台本・論文の中身・音声・参照音声の名前・個人のパスやアドレス・ユーザー名。要るなら「数式の多いスライドで」のように一般化する
3. `.github/ISSUE_TEMPLATE/feedback.yml` の欄に合わせて下書きを書き、**全文をユーザーに見せる**：
   ```
   ### Type
   Bug / 不具合            ← Bug / Confusing / Idea / Praise のどれか
   ### What you did
   ### What happened (and what you expected)
   ### Version
   現在のバージョン             ← npx egatari@0.6.x --version の出力（と、make・studio の指示のバージョン）
   ### Browser
   ### OS
   ### Context
   lang=ja, mode=talk, via Claude Code (egatari-studio:studio)
   ```
4. ユーザーが「送って」と明示したときだけ作る（修正を依頼されたら修正して見せ直す）：
   ```bash
   gh issue create -R egatari/egatari-studio --title "[feedback] 一行の要約" --label feedback --body-file <下書き>
   ```
5. 作った issue の URL を伝える。`gh` が使えない・ログインしていないときは、下書きと `https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml` を渡して、ユーザーに貼り付けを依頼する
