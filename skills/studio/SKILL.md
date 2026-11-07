---
name: studio
description: リポジトリで Egatari 教材の品質チェック・id の付与・組み立て・Egatari ファイルの作成・開発サーバーのコメント反映・手元の音声作成・動画化・新しいパーツの作成を行う。「品質チェックして」「組み立てて」「Egatari ファイルにして」「コメントを反映して」「動画にして」「パーツを作って」「この図をパーツにして」で使う。Use for checking and building lessons locally, applying comments, adding local audio, exporting video and writing parts.
---

Always reply in the language the user writes in. Write slides and narration in the lesson's language.

# egatari-studio:studio：教材をローカルで確かめて組む

書き方の決まりは `egatari:make` に従う（先に読む）。make が入っていなければ、Claude Code は `/plugin install egatari@egatari`、Codex は `codex plugin add egatari@egatari` を案内する。

<!-- generated: instruction-version -->
**指示の版：e082831d**
<!-- /generated: instruction-version -->

make の版の行と違えば、両方のプラグインを更新するよう利用者に伝える。

インストール：

```text
/plugin marketplace add egatari/egatari-studio
/plugin install egatari@egatari
/plugin install egatari-studio@egatari
```

Codex の入れ方（Codex のターミナルで）：`codex plugin marketplace add egatari/egatari-studio`、`codex plugin add egatari@egatari`、`codex plugin add egatari-studio@egatari`。

更新は、Claude Code では `/plugin update egatari-studio@egatari` と `/plugin update egatari@egatari`。Codex では `codex plugin marketplace upgrade egatari` のあと `codex plugin add egatari-studio@egatari` と `codex plugin add egatari@egatari` をもう一度。どちらの道具でも、ターミナルで `npx egatari@0.6.x skills update` を実行すると、入っている道具すべてを更新する。更新したら道具を再起動する。

必要な作業の参照だけ読む：

- [音声を付ける](references/audio-local.md)
- [動画にする](references/video.md)（既存の音声を使う）
- [パーツを書く・直す・提案する](references/parts.md)

CLI では R-output の囲みの代わりに作業フォルダへ書き、画像・JSON・macros.tex も同梱できる。

## コマンド：egatari（npm の包み）

コマンドはすべて npm の包み egatari で動かす：`npx egatari@0.6.x <コマンド>`（Studio の 0.6 系に版を固定する）。リポジトリの clone も `npm ci` も要らない。要るのは Node.js（と npm。Node.js に付いてくる）だけ。初めて動かすときに npx が包みを取ってくる。

`npx egatari@0.6.x` が使えない（ネットのないサンドボックスなど）ときは、入れてある Studio の `bin/egatari.mjs` を `node` で動かす（プラグインの写しの中にある）。同じコマンドと引数で動く。

作業の初めに 1 回 `npx egatari@0.6.x doctor` を動かし、表示を読む：

- `npx` が見つからない、または `NG node`：Node.js が無いか古い。表示の版のものを <https://nodejs.org/> から入れてもらう。入れられなければ、書くのは `egatari:make` だけで済ませ、作業フォルダを Chrome か Edge の <https://studio.egatari.org/> で開いてもらう（品質チェック・組み立て・音声はそこでできる）
- `NG browser`：check・sheet・comment-shots・video に要る。表示の手順（Chrome か Edge を入れる、`npx playwright-core install chromium`、または `CHROME_PATH`）を案内する
- `-- uv`：音声（`tts`）にだけ要る。`-- ffmpeg`：動画（`video`）にだけ要る。その作業をするときに、表示の入れ方を案内する
- 包みを取れない（ネットにつながらないなど）ときは、出た表示をそのまま利用者に見せる

同梱のファイル（パーツの一覧・パーツの README・約束事）は、プラグインの根 `<root>`（この SKILL.md のあるフォルダから 2 つ上）にあり、読むだけ。`<root>` でコマンドを動かさない。作業フォルダ `<deck>` は `<root>` の外に置く。

## CLI：作業フォルダ

教材は 1 つのフォルダにする。

```
<deck>/
  deck.html       スライド（雛形は `npx egatari@0.6.x new <deck>` が作る）
  narration.md    台本（人が読んで直す。雛形も new が作る）
  egatari.json    教材の設定。new が {"componentsCatalogue": "2"}（パーツライブラリ 2 で組む）で作る。自分でフォルダを作るときも同じものを書く。今ある教材の値は変えない
  data/  figs/    検算済みスクリプトの出力（JSON）、matplotlib の SVG
  scripts/        数値と図を作るスクリプト（uv で実行）
  macros.tex      論文の \newcommand（あれば）
```

## CLI：構成案から配布まで

1. **材料を読む**：TeX の原稿（と、あればレジュメ）。発表時間、出口（学会発表／授業）、テーマ（同梱で選べるのは `default`（藍）・`sumi`（墨）・`kokugo`（国語）・`tokiwa`（常盤）・`murasaki`（江戸紫）・`kogecha`（焦茶）・`asagi`（浅葱）。報告・提案・ピッチなら `sumi`、国語なら `kokugo`、ほかは `default`。`business` は新しい教材には使わない。機関のロゴ入りのテーマなど同梱でないものは、利用者のテーマのフォルダ（`EGATARI_THEMES`・`~/.egatari/themes`）か教材のフォルダの `themes/<名前>/` に置いてあるものを名前で選ぶ。見つからなければ組み立てが `theme not found` と警告して `default` で組むので、その警告が出たら利用者に置き場所を確かめる）を確かめる。分からなければ聞く。話者は既定で 1 人（掛け合いは頼まれたときだけ。R-dialogue）
2. **構成案を文字で書いてユーザーに見せる**（ここが一番大事。TeX しかないときは、レジュメの役割をここで果たす）
   - 書く前に、パーツの一覧 `<root>/vendor/components/CATALOG.md` を全部読む（下の「CLI：パーツ」）
   - 形：番号付きの並びで、1 枚に 1 項目。各項目に、この順で書く：見出し／**伝えたいこと**／**おすすめのパーツ**（理由）／結論の行／材料
     - 見出し：章の見出し
     - 伝えたいこと：パーツライブラリの伝えたいこと（`<root>/vendor/components/manifest.json` の `purposes`）のどれか。名前は札の名前 `label.ja` があればそれ、なければ `ja`（比べる（量・特徴）・変化・内訳 など）。どれにも当たらなければ「なし（文と式）」
     - おすすめのパーツ（理由）：その伝えたいことに合うパーツ（`manifest.json` の `components.<名前>.purposes` にその伝えたいことがあるもの。`CATALOG.md` の内容で選ぶ）と、選んだ理由。**おすすめにする前に、必要な機能があるかを README で確かめる**（例：`m-map-japan` で地方をまとめて塗れるか）。合うものがなければ「なし」か「新しい表現」（下の「CLI：パーツ」）。**操作できるパーツ**（manifest の `interactive` のとおり。例：`m-predict`）には「発表中に操作できる」と添える
     - **道具**（manifest の `group` が `"tool"` のパーツ）は、授業の中に時間を区切る活動（グループワーク・演習・『3 分で考える』など）があるときだけおすすめに入れる。教材の全体の長さ（「全体で 30 分」など）は当たらない
     - 数：利用者が書いた値か、スクリプトで出す値だけを書く。それ以外は「（値はスクリプトで出す）」と書き、構成案の段で数を作らない
   - パーツは**おすすめとして聞く**。例：「このスライドは年表のパーツ `m-timeline` がおすすめです。使いますか。ほかのパーツ・新しい表現・パーツなし（文と式）にもできます」。決めるのは利用者
   - 枚数の目安：話す部分は 1 分 ≒ 1 枚。活動（指示とタイマー）は、何分でも 1 枚と数える。1 枚に 8 行・100 字まで
   - 構成案の終わりに、ファイルの情報を 1 行で聞く。空なら何もしないことを見せる。例：「ファイルの情報：ライセンス（例：CC-BY-4.0）・著作権（例：© 2026 名前）・作成者。空なら書きません」。答えは `<deck>/egatari.json` の `metadata`（下の「CLI：ファイルの情報」）に書く。答えがなければ書かずに進み、最後の組み立てで聞き直さない
   - 承認を得るまで HTML を書かない
3. **静的な版を書く**：`deck.html` をテンプレートから作り（`npx egatari@0.6.x new <deck> [--lang en|ja] [--theme 名前] [--title "…"]` で `deck.html` と `narration.md` のテンプレートができる。空でないフォルダには書かない）、ステップなしで全スライドを書く。`npx egatari@0.6.x check <deck>/deck.html` で検査
4. **ステップと台本を一緒に書く**（egatari:make の共通の書き方）。ステップの順は話す順なので、台本を書きながら `data-step` を決める
   - スライドを足したら、id を書かずに、書き終えたところで `npx egatari@0.6.x ids <deck>` を動かす（下の「CLI：id」）
5. **パーツ**（下の「CLI：パーツ」）。構成案で決めたスライドだけ。使うパーツの `README.md` と `demo.html` を読んでから書く。新しい表現を作ったら、パーツの候補として知らせる（下の「CLI：パーツ」）
6. **品質チェックをかけて直す**：`npx egatari@0.6.x check <deck>/deck.html` のエラーが 0 になるまで（終了コード 2 は検査が終わっていない＝ブラウザが起動できないか落ちた。「エラー 0」ではないので、ブラウザを直して取り直す）。ステップ 0 で見えている本文の一覧は必ず読む
7. **全スライドの最終ステップを 1 枚の画像で見る**：`npx egatari@0.6.x sheet <deck>`（出力は `<deck>/out/sheet.png`。`--cols 4`・`--width 640`・`--tiles`（1 枚ずつの PNG も書く））。品質チェックでは見えないもの（凡例の意味の取り違え、軸の端で切れた点、図と文の食い違いなど）がある。画像を読めるなら Read で開いて全スライドを見て、読めないなら利用者に見てもらう。直したら撮り直す。**図のあるスライドは、先に図の約束（例：染色体は細胞の中にある）を書き出し、`npx egatari@0.6.x sheet <deck> --steps` のステップごとの帯で 1 つずつ確かめる。作り手の「確認しました」だけで終えない**
8. **見ながら直す**：`npx egatari@0.6.x dev <deck>/deck.html` を動かし、表示されたアドレスを開いてもらう（止めるまで動き続けるので、別の端末かバックグラウンドで）。ユーザーはブラウザ上で文字・台本を直し、Alt+クリック（Mac は ⌥ option+クリック）でコメントを残す（編集モードの `m`（ペンのボタン、`d` でも開く）で、スライドに丸や矢印を描いてからコメントを書くこともできる：マーカー）。「コメントを反映して」と言われたら：
   - `<deck>/comments.json` の open を読む（`key` は `スライドの鍵:ステップ`、`range` は deck.html の位置、`quote` は要素の字の頭（点の近くの字があれば「近くの字 ｜ 要素の字」）、`pin` は押した点 `{x, y}`（スライドの座標 1280×720。ないものもある）、`strokes` はマーカーで描いた線 `[[[x, y], …], …]`（同じ座標の線の並び。1 つのコメントに何本でも。マーカーだけ。そのときの `pin` は全部の線の重心。前のコメントは 1 本だけの `stroke: [[x, y], …]` のこともあり、`strokes: [stroke]` と読む））
   - **`strokes`（か `stroke`）があるコメントは、描いた線（丸・矢印・下線）がコメントの指すもの**：丸の中・矢印の先・下線の上が対象で（線が何本もあれば、全部を合わせて読む：丸と矢印なら丸の中を矢印の向きへ、など）、`quote` と `range` は全部の線の重心の下の要素からとった手がかりにすぎない。comment-shots の画像（描いた線を赤で描いてある）を見て決める
   - **先に `npx egatari@0.6.x comment-shots <deck>` を動かし、画像を見る**（Read で開く）。`<deck>/.cache/comment-shots/<id>.png` が点の周りの切り抜き（2 倍）、`<id>-full.png` がスライド全体で、どちらにも赤い輪で点を描いてある。図・パーツへのコメントは、輪の所にある線・札・語が対象。言葉だけで決めない
   - 直したら、そのステップを撮り直して（同じコマンドに id を付ける）、直ったかを目で確かめる。終わったものを resolved にする
9. **Egatari ファイルにする**：`npx egatari@0.6.x build <deck> --portable` → `<deck>/<教材の題名>.ega.html`（教材のフォルダの最上位。書いた場所は表示される）。スライド・台本と音声（あれば）も入った Egatari ファイルで、どこでも再生でき、編集アプリ <https://studio.egatari.org/> で開いて直し、音声を付け、保存し直せる（フォルダは要らない）。これを仕上がりとして渡す
   - 初めて作るときに `<deck>/egatari.json` に教材の id（docId）ができるので、教材のフォルダに残す
   - ファイルの情報は構成案で聞いたものを使い、ここで止めて聞かない
   - 「再生専用」「生徒に配る」と言われたら、`npx egatari@0.6.x build <deck> --play-only` → `<deck>/<教材の題名>.play.ega.html` も作る：編集できるスライドと台本を含まない再生専用。参加者（生徒など）に配るのはこちら
   - 「ただの HTML にして」と言われたときだけ、`npx egatari@0.6.x build <deck>/deck.html` → `<deck>/out/deck.html`（単一の HTML。印刷で PDF）
10. **終わりの知らせ**：`.ega.html` のパス（再生専用も作ったならそのパスも）を書き、<https://studio.egatari.org/> で開くと直したり音声を付けたりできると添える。ライセンスと著作権を聞いて答えがなかったときは、書かずに作ったことと、`egatari.json` の `metadata` に書いて作り直せば入ることを添える

## CLI：品質チェック

`npx egatari@0.6.x check <deck>/deck.html` のエラーが 0 になるまで直す。終了コード 2 は検査が終わっていない印で、エラー 0 ではない。

品質チェックはヘッドレスブラウザを使う。ブラウザが起動できず終了コード 2 なら、検査は終わっていない。『検査は未完了』と伝え、サンドボックスの外で `check` を動かしてもらう。通ったとは書かない。全スライドの最終状態と図のステップを画像で確かめる。チャットではコマンドを頼まず、Studio の品質チェックと「AI への修正依頼をコピー」を使ってもらう。

## CLI：id

初稿にはスライドの id を書かず、書き終えたら `npx egatari@0.6.x ids <deck>` で付ける。スライドを足すたびに動かす。今ある id と台本の `{#…}` は保つ。

## CLI：本のある教材

本（`article.md` か `article/`）のある教材は、id とつなぎの順番が大事。本の書き方は egatari:make の references/book.md。

1. 本・スライド・台本を書く（つなぎはまだ書かない）。
2. `npx egatari@0.6.x ids <deck>`：スライドの id と節の id（`(sec-…)=`）を付け、本の読む順を `egatari.json` に書く。
3. つなぎを書く：節の中の ``{step}`…<s-xxxxxx:k>` ``、スライドの `data-article="sec-…"`。
4. もう一度 `ids`（新しいつなぎを `egatari.json` の `articleLinks` に記録する）。
5. 点検（`npx egatari@0.6.x check <deck>/deck.html`）と組み立て（`npx egatari@0.6.x build <deck>/deck.html`）。本は `out/deck.article.html` にも出る。縦書きの本は開いて確かめる。
6. **書き終えてから** `npx egatari@0.6.x ids <deck> --confirm-links`：つないだ組を読み比べて合っていることを記録する。書いている途中で記録すると、直すたびに「スライドと本が合っていないかもしれません」が出る（直した後に出たら、読み比べてから記録し直す）。
7. Egatari ファイルにするとき（`--portable`）は、本・`references.json`・本の画像が中に入る。

`--portable` の `.ega.html` と `sheet` の画像は作業フォルダに書かれる。git に入れないなら `.gitignore` に足す。

## CLI：テーマを作る（自分のテーマ）

機関の色やロゴで教材をそろえたいと言われたら、同梱のテーマを受け継ぐ小さなテーマを作る。

1. **聞く**：テーマの名前（英小文字。`tml` など）、基調色（`--base`。1 色）、強調の色（なければ同梱の式から導く）、ロゴの画像（png・jpg・svg・webp。使ってよいかを確かめる。機関のロゴは使用の条件がある）、置き場所（この教材だけ → `<deck>/themes/<名前>/`、自分の教材すべて → `~/.egatari/themes/<名前>/`）。
2. **作る**：
   ```
   <名前>/
     theme.json   {"name": "<名前>", "extends": "default", "logos": ["logos/cover.png"]}
     tokens.css   :root{ --base: #0A2D92; --emph: #D7000F; --cover-bg: #F6F9F6; --logo-h: 128px; }
     logos/cover.png
     LICENSE      ロゴ・字体の使用の条件（Egatari ファイルに一緒に入る）
   ```
   - 色は変数だけで決める（`docs/reference.ja.md`「テーマ」の変数の表：<!-- generated: doc reference.ja.md#テーマ -->https://github.com/egatari/egatari-studio/blob/v0.6.5/docs/reference.ja.md#テーマ<!-- /generated: doc -->）。箱の位置を動かす CSS は書かない（書くなら `metrics` を宣言する）。
   - 字体を替えるなら `theme.json` の `fonts`（Studio が入れられる一覧から）。
   - 表紙の背景に画像を敷くには、画像をテーマのフォルダに置き、`tokens.css` で相対の `url()` を書く（例：`--cover-bg: url(cover.png) center/cover no-repeat;`）。組み立てが画像を埋め込み、テーマの hash と Egatari ファイルにも入る。テーマのフォルダの外のファイルは使えない（警告が出て拒まれる）。ないファイルは警告が出て `url()` のまま残る。ロゴは `theme.json` の `logos`。
3. **確かめる**：サンプルの教材を `--theme <名前>` で組み、`npx egatari@0.6.x check` の `textContrast` が出ないこと（役割の色と地のコントラスト 4.5:1）、表紙のロゴの大きさを目で見る。
4. **使う**：教材は `<html data-theme="<名前>">`。Egatari ファイルに書き出すと、テーマ（と LICENSE）が教材の中に入り、どこでも同じに組める。
5. **Studio で使う**：テーマのフォルダを ZIP にして（`cd ~/.egatari/themes && zip -r <名前>.zip <名前>`）、編集アプリの「テーマを読み込む…」→「ZIP ファイルを選ぶ…」。Chrome・Edge ならフォルダのまま「フォルダを選ぶ…」でもよい。
6. 手本：作者のテーマ集（tml・tcue・wsd・ohte）。どれも `extends: default` に色とロゴだけ。

## CLI：ファイルの情報

題名は `<title>`、言語は `<html lang>`。ライセンス・著作権・作成者は `<deck>/egatari.json` の `metadata`（license・copyright・creators・attribution）。構成案のときに 1 行で聞き（「CLI：構成案から配布まで」の 2）、答えのあったものだけを書く。値を作らない。参加者の名前・成績・回答・顔写真・提出物は例にも入れない。必要な例は架空と書く。

## CLI：パーツ

パーツはパーツライブラリ（egatari/components）のリリースの写し `<root>/vendor/components/` にある。**全部のパーツが使える**（標準・専門・特殊のパーツも、道具も。チャットの AI への指示のように、プランや分野で絞らない）。

- 一覧：`<root>/vendor/components/CATALOG.md`（全部のパーツの内容・ステップの数・受け取る値）。構成案の前に全部読む。使うと決めたパーツは `README.md`（書き方・データの形・台本との合わせ方）と `demo.html`（動く例）を読む。置き場所は `<root>/vendor/components/sha256/<hash>/`：`<hash>` は `<root>/components.lock.json` の `components.<名前>.content` の、既定の版（同じところの `default`）の値
- 分け方：パーツライブラリ 2.0 の manifest `<root>/vendor/components-2/manifest-<版>.json`（版は `<root>/components2.lock.json` の `default`）の `components.<名前>`
  - `tier`：`standard`（標準）・`specialized`（専門）・`extra`（特殊）。スキルではどれも使える
  - `set`：専門パーツのセット（例：`stats`・`math`・`maps`・`kokugo`・`english`・`music`・`business`・`tools`）。固定の分野一覧で絞らず、manifest の値を読む
  - `kind`：`element` は教材に置くパーツ、`library` はほかのパーツが使うライブラリ
  - `display`：タグとは別の表示名。あれば利用者への名前に使う
  - `purposes`：そのパーツが合う伝えたいこと（`purposes` の `id`。名前は `purposes` の `ja`）
  - `interactive`：`true` なら操作できるパーツ。構成案で「発表中に操作できる」と添える
  - `group`：`"tool"` なら道具。授業の中に時間を区切る活動（グループワーク・演習・『3 分で考える』など）があるときだけ使う
- 使った例：`<root>/examples/minimal`（`m-sweep`）、`<root>/examples/pitch-fictional`（`m-bars` などビジネスのパーツ）、`<root>/examples/kokugo-kanbun`（`m-kanbun`・`m-menu`）
- **合うパーツがないとき**：伝えたいことに合うパーツがなければ、表現カタログ（egatari/components の docs/expression-catalogue.md。パーツライブラリのリポジトリを clone してあればその中、なければ <https://github.com/egatari/components/blob/main/docs/expression-catalogue.md>）を見て、新しい表現を作ってよい。作るのは、その教材のパーツ（`<deck>/components/<名前>/index.js`。[パーツを書く手順](references/parts.md)）か、インライン SVG と `data-step`。カタログを読めなければ、インライン SVG と `data-step` で描く。作ったら、構成案と終わりの報告で**パーツの候補**として知らせる（何を伝えるための表現か・どのスライドか・カタログのどの項目に近いか）。パーツライブラリへの提案は、利用者が頼んだときだけ（[パーツを書く手順](references/parts.md)）
- **数値は検算済みのスクリプトの出力だけを使う**。`scripts/` に Python（uv）で書き、`data/*.json` に出し、パーツの子に `<script type="application/json">{{JSON:x.json}}</script>` で渡す。見た目のために数値を作らない
- 図に matplotlib などのグラフを入れるときは、各軸にデータの範囲より余白を取る（`ax.margins(0.05)` など）。端の点がプロット領域で切れないようにする
- 動きは注意の誘導に限る。飾りの動きは付けない
- 静的な図は matplotlib の SVG（図の幅[in] = 表示幅[px] / 100、文字 18pt）を `{{FIG:名前}}` で

## CLI：音声を付ける

手元で付けるときは [音声の手順](references/audio-local.md) を読む。

## 動画にする

[動画の手順](references/video.md) を読む。既存の音声を使い、音声は作らない。

## パーツを書く・提案する

[パーツを書く手順](references/parts.md) を読む。

## CLI： 使い終わりの感想（フィードバックを送る）

ユーザーが「感想を送って」「フィードバックして」「不具合を報告して」と言ったとき、または長い作業の終わりで、ユーザーが前もって送ってよいと言っていたときに行う。勝手には送らない。

1. この作業で困ったこと・不具合・わかりにくかった手順・よかった点を、箇条書きで短くまとめる（何をして、何が起きて、どうなってほしかったか）
2. **私的な内容を入れない**：スライドの本文・台本・論文の中身・音声・参照音声の名前・個人のパスやアドレス・ユーザー名。要るなら「数式の多いスライドで」のように一般化する
3. `.github/ISSUE_TEMPLATE/feedback.yml` の欄に合わせて下書きを書き、**全文をユーザーに見せる**：
   ```
   ### Type
   Bug / 不具合            ← Bug / Confusing / Idea / Praise のどれか
   ### What you did
   ### What happened (and what you expected)
   ### Version
   現在の版                ← npx egatari@0.6.x --version の出力（と、make・studio の指示の版）
   ### Browser
   ### OS
   ### Context
   lang=ja, mode=talk, via Claude Code (egatari-studio:studio)
   ```
4. ユーザーが「送って」と明示したときだけ作る（直してと言われたら直して見せ直す）：
   ```bash
   gh issue create -R egatari/egatari-studio --title "[feedback] 一行の要約" --label feedback --body-file <下書き>
   ```
5. 作った issue の URL を伝える。`gh` が使えない・ログインしていないときは、下書きと `https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml` を渡して、ユーザーに貼ってもらう
