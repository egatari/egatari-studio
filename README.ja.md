# motion-academic-slides

[English](README.md) | 日本語

動きのある HTML の学術スライド。段階表示と動く図で説明の順を見せる。1 つの原稿（`deck.html` と `narration.md`）から、発表・授業・PDF、そして必要なら TTS の動画まで作る。[Claude Code](https://claude.com/claude-code) のスキル（`skills/`）で動かす前提で作ってあるが、どの手順も Node のコマンドなので、Claude Code なしでも使える。

![TMLR 2026 の見本の 1 枚](docs/images/hero.png)

## できること

- **段階表示**：`data-step="k"` で話す順に出す。結論の行（`.concl`）は自動で最後
- **数式**：KaTeX でビルド時に組む。`\hlE{…}` `\hlT{…}` `\hlM{…}` で式の一部にテーマの色を付ける
- **動く図**：Web Components の部品（`components/`：`m-sweep` `m-curves` `m-flow` `m-collect` `m-seq`）。画面は (スライド, 段階, 時刻) だけで決まるので、そのままコマ単位で動画に書き出せる
- **注目の演出**：口述原稿に `{mark:ID|circle}` と書くと、その言葉のところでスライドに手描きの下線・囲み・枠・スポット・レーザーの点が出る
- **モーフ**：`data-morph` のスライドでは、前のスライドの式や要素が今の位置へ滑ってくる（Keynote のマジックムーブ）
- **1 つの原稿で 3 つのモード**：発表（`?mode=talk`）、授業（`?mode=lecture`：全部見せて今の段階を強調）、動画（`?mode=video`）
- **発表の道具**：発表者ビュー（口述原稿がカンペになる・タイマー）、スライド一覧、レーザー、ペン、消えるペン、操作の帯
- **テーマ**：基調色 1 つで切り替える（`themes/<名前>/tokens.css`）。部品はテーマの変数だけを使う
- **検査**：`kit/check.mjs` がはみ出し・文字の大きさ・段階・口述原稿の抜け・配色のコントラスト・部品の再現性・注目の演出・モーフを調べる
- **開発サーバー**：ブラウザの上で文言と口述原稿を直し、Claude Code への指示を残せる
- **出力**：単一の HTML（字・数式と、原稿が参照するローカルの画像・動画・CSS を埋め込み済み、オフラインで開ける）。印刷か `tools/pdf.mjs` で PDF

**リファレンス**：選択肢・記法・キー・環境変数をすべて 1 ページに：[docs/reference.ja.md](docs/reference.ja.md)

| 注目の演出 | モーフ（前・途中・後） |
|---|---|
| ![注目の演出](docs/images/mark.png) | ![モーフ](docs/images/morph.png) |

| 発表者ビュー | スライド一覧 |
|---|---|
| ![発表者ビュー](docs/images/presenter.png) | ![スライド一覧](docs/images/overview.png) |

## 2 つの使い方

| | 段階 1：スライド（中心） | 段階 2：読み上げ付きの動画（任意） |
|---|---|---|
| できるもの | HTML のデッキ、発表者ビュー、授業モード、PDF | 段階ごとの MP4、全体の動画、教材のバンドル |
| 要るもの | Node 22 以上。Google Chrome は検査・PDF・テストにだけ使う | 段階 1 のもの＋ffmpeg・uv・TTS のサーバー・参照音声 |
| あると良いもの | uv（字の絞り込み） | |

**スライドは TTS なしで全部使える。** 段階 1 のコマンドは `tts/` と `render/` から何も読み込まない。`audio/` や `voice.json` がなくても build・check・開発サーバーは動く。音声がなければ、自動再生（`a`）は各段階の既定の長さで進み、口述原稿は発表者ビューにカンペとして出る。

## 要るもの

**段階 1（スライド）**

- [Node.js](https://nodejs.org/) 22 以上
- Google Chrome：`kit/check.mjs`・`tools/pdf.mjs`・スクリーンショット・テストで使う（`playwright-core` の channel `chrome`）。組むことと発表には、ファイルを開くブラウザがあればよい。Chrome がなければ `npx playwright-core install chromium` を実行する（Playwright の Chromium を代わりに使う）か、`CHROME_PATH=/path/to/chrome-or-chromium` を指定する
- あると良い：[uv](https://docs.astral.sh/uv/)。`sh tools/get-fonts.sh` で BIZ UDPゴシックの TTF を取ってくると、build が uv で `pyftsubset` を動かし、使っている字だけを埋め込む。TTF（または uv）がなければ `@fontsource` の分割ファイル（WOFF2）のうち使う字を含むものを埋め込む。ファイルは大きくなるが見た目は同じ

**ブラウザ**

- 組んだ HTML の発表：Chrome/Edge 119 以上、Firefox 128 以上、Safari 18 以上（テーマが `--base` から淡色などを導くのに使う CSS の相対色の記法と `color-mix()` に対応しているもの）。それより古いブラウザでも表示はできるが、色はテーマの `--base` から導いたものではなく、既定のテーマから計算した固定の予備の色になる
- PDF（`tools/pdf.mjs`）・動画（`render/`）・`kit/check.mjs`・テストは Google Chrome（または Playwright の Chromium）だけで作り、確かめている

**段階 2（動画）**

- ffmpeg と ffprobe（`PATH` に置く）
- uv（`tts/` の小さな Python プロジェクトを動かす）
- OpenAI 互換の音声合成 API を持つ TTS のサーバー。たとえば [mlx-audio](https://github.com/Blaizzy/mlx-audio) で `mlx-community/Irodori-TTS-v4.1-Small-fp16`（日本語）か `mlx-community/VoxCPM2-8bit`（英語など）を動かす。場所は `IRODORI_URL`（既定 `http://localhost:8882`）
- 参照音声は自分で用意する：`<名前>.wav` を `tts/voices/`（git 管理外）か `IRODORI_REF_DIR` に置く

## はじめ方（段階 1：スライド）

```bash
git clone https://github.com/moiku/motion-academic-slides.git
cd motion-academic-slides
npm ci
sh tools/get-fonts.sh                               # 任意：埋め込む字を小さくする（curl が要る。build で uv を使う）

node kit/build.mjs examples/minimal/deck.html       # → examples/minimal/out/deck.html
open examples/minimal/out/deck.html                 # macOS。ほかの OS ではファイルをブラウザで開く

node kit/check.mjs examples/minimal/deck.html       # 検査。最後の行が「エラー 0」になる
node tools/pdf.mjs examples/minimal/out/deck.html examples/minimal/out/deck.pdf   # PDF（1 スライド 1 ページ）
node server/dev.mjs examples/minimal/deck.html      # 開発サーバー http://127.0.0.1:8730/（Ctrl+C で止める）
```

自分のデッキは `examples/minimal/` を別のフォルダに写し、`deck.html` と `narration.md` を直して作る。テーマは `<html data-theme="tml">` か `--theme tml` で選ぶ。英語のデッキは `<html lang="en">` にする（本文の字が Source Sans 3 になり、検査も英語の規則になる）。

## ブラウザで直す（開発サーバー）

`deck.html` を手で開いて書き換える必要はほとんどない。開発サーバーを起動して、スライドの上で直す。

```bash
node server/dev.mjs path/to/deck.html            # http://127.0.0.1:8730/ を開く（Ctrl+C で止める）
```

画面はいつもの発表画面（矢印・`p`・`a` などはそのまま使える）。デッキのファイルが変わると自動で読み込み直し、スライドと段階はそのまま残る。

1. **文字を直す：`e` → ダブルクリック。** 直せる要素に点線の枠が出る。ダブルクリックでその部分の原稿（HTML と `\( … \)` の式）が開くので、直して ⌘/Ctrl+Enter。`deck.html` のその要素だけが書き換わる
2. **口述原稿を直す：`n`。** 右に今の段階の口述原稿が出る。直して保存（発言の追加・削除・話者の変更もできる）。`narration.md` のその段階だけが書き換わる
3. **Claude Code に頼む：Alt+クリック（Mac は ⌥ option キーを押したままクリック）。** 直してほしいことを書く（「この図を大きく」「このスライドを 2 枚に分けて」）。指示は `comments.json` に貯まり、`c` で一覧。Claude Code に「コメントを反映して」と頼むと直し、保存した時点で画面に出る
4. **元に戻す：** 書き換える前の `deck.html`・`narration.md` は `.cache/edits/` に残る（新しい 30 個）

| `e`＋ダブルクリック：原稿を直す | `n`：口述原稿を直す | Alt / ⌥ option+クリック：Claude Code への指示 |
|---|---|---|
| ![editor](docs/images/dev-editor.png) | ![narration](docs/images/dev-narration.png) | ![comment](docs/images/dev-comment.png) |

詳しくは [docs/dev-server.md](docs/dev-server.md)。

## Claude Code で使う

スキルを Claude Code のスキルのフォルダにリンクする。スキルはリンク先の実体の場所からリポジトリを探すので、clone した場所は動かさない。

```bash
mkdir -p ~/.claude/skills
ln -s "$PWD/skills/motion-slides"       ~/.claude/skills/
ln -s "$PWD/skills/motion-slides-video" ~/.claude/skills/
ln -s "$PWD/skills/motion-components"   ~/.claude/skills/
```

| スキル | 使いどころ |
|---|---|
| `motion-slides` | 構成案・原稿・段階・口述原稿・検査・build（段階 1） |
| `motion-slides-video` | TTS・動画の書き出し・バンドル（段階 2） |
| `motion-components` | 動く図の部品を新しく書く、部品庫に移す |

頼み方の例：

- 「`paper/main.tex` から 10 分の発表の HTML スライドを motion-slides で作って。テーマは default、1 人で話す」
- 「学習率で損失の下がり方が変わる様子を m-sweep で見せるスライドを足して」
- 「コメントを反映して」（開発サーバーで Alt / ⌥ option+クリックの指示を残した後。Claude は `comments.json` を読む）
- 「`talks/intro` を motion-slides-video で読み上げ付きの動画にして」

スキルはまず構成案を見せ、承認を得てから HTML を書く。

## 動画にする（段階 2）

```bash
D=examples/minimal
uv run --project tts python tts/synth.py $D --dry-run    # 無音の仮の音声（オフラインで流れを試す）
uv run --project tts python tts/synth.py $D              # 本番の TTS（サーバーと参照音声が要る）
node kit/build.mjs $D/deck.html                          # 組み直して、音声の長さをタイムラインに入れる
node render/render.mjs $D/out/deck.html --out $D/video   # 1 段階だけなら --only "更新の式:2"、1 本にまとめるなら --full
node render/export-canon.mjs $D --render $D/video --out $D/bundle
```

- 声：`--voices expert=alice,novice=bob` か `<デッキ>/voice.json`（`{"expert": "me"}`、または wav のパス）。既定は 1 人なら `alice`、掛け合いなら `alice`（Expert）と `bob`（Novice）で、`tts/voices/<名前>.wav` を探す
- サーバーが動いていない、参照音声がないときは、`synth.py` がその URL やファイルを示して止まる
- `export-canon.mjs` は教材のバンドル（Marp 形式の md と、段階ごとの MP4・PNG）を作る。canon は TML 研究室の講義配信システムだが、同じ形式を受け付けるほかのシステムにも使える。`CANON_DIR` があれば canon 自身の parser でも確かめ、なければその検査を飛ばす
- **音声入りの HTML**：`node kit/build.mjs $D/deck.html --embed-audio` で口述原稿の音声を HTML の中に入れる。1 つのファイルだけで、どこでも `a`（自動再生）で音声付きで進む。音声は AAC（64 kbps・モノラル）に圧縮する（5 分で約 4.5 MB。WAV のままだと約 30 MB）。今の主要なブラウザはすべて再生できる。`--embed-audio` を付けなければ、HTML は `audio/` の WAV を参照するだけで変換しない。ffmpeg がなければ WAV のまま埋め込み、build が警告する
- 詳しく（キャッシュ、`timeline.json` での長さの調整、読み辞書）：[docs/video.md](docs/video.md)

## 操作（発表）

| キー | すること |
|---|---|
| → / Space、← | 次の段階 / 前の段階 |
| Shift+→ / Shift+← | 次のスライド / 前のスライド |
| 数字＋Enter | そのページへ |
| f | 全画面 |
| p | 発表者ビュー（カンペ・次の段階・タイマー） |
| a | 自動再生（音声があれば流す） |
| l | 授業モード |
| b | 暗転 |
| o | スライド一覧（矢印で選んで Enter） |
| x / d / v | レーザー / ペン / 消えるペン。Shift+d でペンの色 |
| Backspace（Shift+Backspace） | ペンを使っている間：このスライドの書き込みを消す（全部消す） |
| Esc | 道具を解除 |
| ? | キーの一覧 |

すべてのキー（Home/End、PageUp/PageDown、発表者ビューのキー）と URL の引数は [docs/reference.ja.md#発表](docs/reference.ja.md#発表)。

マウスを動かすと、同じ操作のボタンを並べた帯が出る（2.5 秒止まると隠れる）。ペンの線はスライドごとに残り、印刷と動画には出ない。

![操作の帯](docs/images/controls.png)

## テーマ

テーマは `themes/<名前>/` のフォルダで、中身は次の 2 つ。

- `tokens.css`：CSS の変数。ふつうは基調色 `--base` だけを書く。ほかの色（`--term` `--emph` `--muted` `--title`、淡色、`--series-*`）は `themes/default/tokens.css` が基調色から導く。どれも上書きできる
- `theme.json`（任意）：`{"name": "mylab", "extends": "default", "logos": ["logos/cover.png"]}`。ロゴは表紙に出る

```bash
mkdir -p themes/mylab
printf ':root{ --base: #006d5b; }\n' > themes/mylab/tokens.css
printf '{"name": "mylab", "extends": "default"}\n' > themes/mylab/theme.json
node kit/build.mjs examples/minimal/deck.html --theme mylab
```

テーマはデッキの隣（`<デッキ>/themes/<名前>/`）にも置ける。同梱：`default`（中立）と、機関のテーマ `tml` `tcue` `wsd` `ohte`（大学のロゴを含む。ライセンスの節を参照）。

## 見本

| 見本 | 内容 |
|---|---|
| [`examples/minimal`](examples/minimal) | 日本語・6 枚（勾配降下法）。段階、KaTeX と `\hlE`、`{mark}`、`data-morph`、`m-sweep`、全段階の口述原稿。新しいデッキの雛形 |
| [`examples/tmlr2026-calibration`](examples/tmlr2026-calibration) | 英語・14 枚（TMLR 2026 の論文の紹介）。デッキ専用の部品（`components/`）、スクリプトで作ったデータ（`scripts/` `data/`）、英語の TTS（`voice.json`）、テーマ `tml` |

`examples/tmlr2026-calibration` の `voice.json` は TTS の既定の声を使う。公開しているこの見本の動画は、著者本人の参照音声で読み上げたもの（参照音声はリポジトリに含めていない）。

`examples/minimal`：

![minimal の見本](docs/images/minimal-sheet.png)

`examples/tmlr2026-calibration`：

![tmlr2026-calibration の見本](docs/images/tmlr-sheet.png)

## 構成

| 場所 | 中身 |
|---|---|
| `docs/contract.md` | 約束事（位置と時刻、部品、口述原稿、タイムライン、注目の演出、モーフ）。**まずここを読む** |
| `docs/reference.ja.md` | リファレンス：原稿の記法、口述原稿、長さ、テーマ、キー、URL の引数、すべてのコマンドの選択肢と環境変数（[English](docs/reference.md)） |
| `kit/` | 実行系（`deck.js` `presenter.js` `tools.js`）、体裁、ビルド、口述原稿の解析、検査、ブラウザの起動 |
| `components/` | 動く図の部品。一覧は `components/CATALOG.md` |
| `themes/` | テーマ |
| `server/` | 開発サーバーとブラウザ上の編集 |
| `tts/` `render/` | 段階 2：TTS（uv のプロジェクト）、動画の書き出し、バンドルの出力 |
| `skills/` | Claude Code のスキル |
| `tools/` | テストと補助（`smoke` `test-*` `shot` `pdf` `get-fonts.sh`） |

テスト（Chrome が要る）：

```bash
node kit/build.mjs examples/minimal/deck.html
node tools/smoke.mjs examples/minimal/out/deck.html /tmp/smoke     # タイムラインとスクリーンショット
node tools/test-components.mjs
node tools/test-tools.mjs examples/minimal/out/deck.html
node tools/test-controls.mjs examples/minimal/out/deck.html
node tools/test-dev-server.mjs
```

## フィードバックと貢献

- デッキで `?` を押し、「**フィードバックを送る**」を押す（発表者ビューにもある）。版・ブラウザ・OS・言語・モードだけを入れた [フィードバックの form](https://github.com/moiku/motion-academic-slides/issues/new?template=feedback.yml) が開く。スライドの中身は送らない。`<html data-feedback="off">` で消せる
- Claude Code では「感想を送って」と言う。スキルが作業中に困ったことを issue の下書きにまとめ、確認を取ってから作る
- 新しい図が欲しいときは [部品の依頼](https://github.com/moiku/motion-academic-slides/issues/new?template=component-request.yml)。デッキの中で書いた部品は [部品の提案](https://github.com/moiku/motion-academic-slides/issues/new?template=component-submission.yml) から
- 質問は [Discussions](https://github.com/moiku/motion-academic-slides/discussions) へ。貢献の仕方は [CONTRIBUTING.ja.md](CONTRIBUTING.ja.md)

## セキュリティ

デッキはコードとして扱う：原稿のスクリプトと部品は、ブラウザと、検査器・書き出しが使う headless Chrome の中で動き、build は原稿のフォルダの中のローカルのファイルを読む。信頼できるデッキだけを組み、開発サーバーで開くこと。信頼の前提と脆弱性の報告のしかた：[SECURITY.md](SECURITY.md)。

## ライセンス

- コード：[MIT](LICENSE)、Copyright (c) 2026 Gendo Kumoi。フォント・KaTeX のフォント・ロゴは [NOTICE](NOTICE) を参照
- 字：BIZ UDPゴシックと Source Sans 3 は SIL Open Font License 1.1（BIZ UDPゴシックは [fonts/OFL.txt](fonts/OFL.txt)、`@fontsource` のパッケージにはそれぞれのライセンスのファイルがある）。組んだデッキはこれらの一部を埋め込む。KaTeX とその字は MIT
- `themes/tml` `themes/tcue` `themes/wsd` `themes/ohte` の大学のロゴは各機関のもので、MIT ライセンスの対象外
