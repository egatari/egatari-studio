<!-- i18n: pair=CONTRIBUTING.md sha256=bbeec291dd3d431d -->
# 貢献の仕方

[English](CONTRIBUTING.md) | 日本語

感想・不具合の報告も、新しい部品も歓迎します。短い報告でも PR と同じくらい助かります。

## フィードバック

- **デッキから**：`?` を押して、一覧の下の「**フィードバックを送る**」を押す（発表者ビューのキーの行の右端にもある）。[フィードバックの form](https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml) が、版・ブラウザ・OS・デッキの言語・モードだけを入れた状態で開く。スライドの中身は送らない。断片を貼るのは公開してよいものだけにする
- **Claude Code から**：「感想を送って」「フィードバックして」と言う。`motion-slides` スキルが、その作業で困ったこと・不具合を issue の下書きにまとめて見せ、確認を取ってから作る。スライドの本文・音声・個人のパスは入れない
- **使い方の質問**は [Discussions の Q&A](https://github.com/egatari/egatari-studio/discussions/categories/q-a) へ。作ったデッキや動画は [Show and tell](https://github.com/egatari/egatari-studio/discussions/categories/show-and-tell) へ
- **脆弱性**は公開の issue でなく [SECURITY.md](SECURITY.md) の方法で

## 部品

### 1. まず頼むか、デッキの中で書く

- [components/CATALOG.md](components/CATALOG.md) を見る。既存の部品に属性を足すだけで済むことが多い
- 案だけなら [部品の依頼](https://github.com/egatari/egatari-studio/issues/new?template=component-request.yml) を出す：何を動かすか、どの論文・図か、スケッチ、段階ごとに何が出るか
- 自分で書くなら、まず**デッキ専用**に `<deck>/components/<名前>/index.js` に置く（build はデッキ → リポジトリの順に探す）。手順は `motion-components` スキル

### 2. 部品庫に入れる条件

次のどちらかを満たしたら `components/<名前>/` に移す。

- 2 つ目のデッキで使われた
- デッキに依存しない形に書けた（文言と数値をすべて属性（`props`）か子の JSON で渡せる）

### 3. PR のチェックリスト

PR（または、コードを貼った [部品の提案](https://github.com/egatari/egatari-studio/issues/new?template=component-submission.yml) の issue）に次をそろえる。

- [ ] `components/<名前>/README.md`：frontmatter に `name` `summary` `steps` `props`、本文に「いつ使うか」
- [ ] `components/<名前>/demo.html`：1〜2 枚の見本のデッキ
- [ ] `node tools/test-components.mjs <名前>` が通り、スクリーンショット（動きの途中と最終状態）を目で見た
- [ ] 色はテーマの変数だけ：`var(--term)` `var(--emph)` `var(--muted)` `var(--accent2)` `var(--line)` `var(--fg)` `var(--series-1..4)`
- [ ] `render(k, t)` が決定的：`setTimeout`・`requestAnimationFrame`・`Date`・シードのない乱数を使わない。`t = Infinity` は段階 `k` の最終状態
- [ ] `npm run gen` を走らせた（CATALOG.md と AI への指示は生成物。手で直さない）
- [ ] `changes/<名前>.md` の断片（[CHANGELOG](#changelog) を見る）
- [ ] `npm test` が通る

## テストの走らせ方

```bash
npm install
npm test                 # 全部（Chrome か Playwright の Chromium が要る）
node tools/test-all.mjs --only test-components,test-tools
```

CI は push と PR ごとに Node 22 と 24 で `npm test` を回す。`node tools/test-all.mjs --list` はすべての段とその引数を出す。

単体の試験は一覧に書かずに見つける：先頭の近くに `// test-all: unit` の行がある `tools/test-*.mjs` を引数なしで走らせる（ブラウザが要らないものに限る）。引数・組んだデッキ・決まった順番が要る試験は `tools/test-all.mjs` に段として書く。ほかの試験が読み込む試験には `// test-all: part of <段>` と書く。`tools/test-*.mjs` がどれにも当たらなければ、`npm test` は何も走らせずに失敗する（新しい試験を入れ忘れないように）。

### 口の形

`tools/test-api-shapes.mjs`（`npm test` に入っている）は、ほかのコードや道具が頼る口の構造（字ではなく鍵と型）を写し `tools/fixtures/api-shapes.json` と比べる：`kit/check.mjs --json` の出力、`buildFixRequest`（`kit/core/llm-fix.mjs`）と `buildPack`（`kit/core/llm-pack.mjs`）とそれが呼ぶ `assemble` の引数と返り値、`extractBlocks`・`mergeSlides`・`mergeNarration`（`kit/core/llm-import.mjs`）の返り値。わざと変えるときは `node tools/test-api-shapes.mjs --update` を走らせ（写しを広げる。狭めるのは手で）、`### Changed (API)` の断片を足す。

## 生成するファイル

次のファイルは生成物で、リポジトリに入れておく（GitHub Pages・編集アプリ・使う人がそのまま読む）。手で直さず、材料を直して `npm run gen` を走らせる：

| ファイル | 作る道具 | 材料 |
|---|---|---|
| `components/CATALOG.md` | `tools/catalog.mjs` | `components/*/README.md` の frontmatter |
| `docs/authoring-with-llms(.ja).md`・`docs/llm-parts/*.md`・`kit/core/llm-pack-data.mjs` | `tools/make-llm-guide.mjs` | `tools/llm-guide/`・`docs/contract*.md`・部品の README と `index.js` |
| `kit/core/katex-ranges.mjs` | `tools/katex-ranges.mjs` | `node_modules` の KaTeX の字（KaTeX の版を上げたとき） |

`npm run gen:check` はそれぞれの道具を `--check` で走らせ（材料から作ったものとファイルが違えば失敗）、CHANGELOG の断片を確かめる。`npm test` も同じことを確かめ、CI は別の短い job でも走らせる。訳の印（i18n）は生成しない：人が両方の言葉を見比べたことの記録だから（[訳](#訳英語と日本語)を見る）。

## CHANGELOG

使う人や呼び出す側が気づく変更には、`CHANGELOG.md` を直す代わりに断片を足す：`changes/<短い名前>.md`（英小文字・数字・`.`・`_`・`-`）に、節の見出しの行と短い項目（1 つ 1〜2 行。続きの行は字下げする）を書く：

```markdown
### Fixed

- Editor app: **Export single file** keeps the attachments of the opened file
```

節は `Added`・`Changed (API)`（[口の形](#口の形)の形や、呼び出す側が使うほかの口の変更）・`Changed`・`Removed`・`Fixed`・`Security`。1 つの断片に節がいくつあってもよい。項目は英語で書く（CHANGELOG は英語）。`CHANGELOG.md` の `## [Unreleased]` は空のままにする。リリースのとき `node tools/changelog.mjs --release X.Y.Z` が断片を（この節の順、節の中はファイル名の順で）`## [X.Y.Z] - <日付>` にまとめ、比べるリンクを直し、`package.json` と `package-lock.json` の版を変え、断片を消す。`--preview` は書かずに節を出すだけ、`--check`（`npm test` に入っている）は断片を確かめる。CI では、コード（`app/`・`kit/`・`components/`・`server/`・`render/`・`tts/`・`themes/`・`lab/`・`skills/`・`package.json`）を変えたのに断片を足していない pull request に警告を出す（失敗にはしない）。リリースの手順は [RELEASING.ja.md](RELEASING.ja.md)。

## 書き方の決まり

正本は [docs/contract.ja.md](docs/contract.ja.md)（英語版 [docs/contract.md](docs/contract.md)）。実行系・部品・口述原稿・タイムラインを変えるときは先にこれを直す（両方の言語を）。要点：

- 画面は `DECK.seek(i, k, t)` だけで決まる（動画の書き出しがこれに頼る）
- 色を直接書かない。機関に依存するもの（基調色・ロゴ）は `themes/<名前>/` の中だけ
- `kit/` `server/` から `tts/` `render/` を読み込まない。音声がなくてもスライドは動く
- 図の文字は 24px 以上。凡例ではなく線の近くに直接書く
- 個人のパスやアドレスをリポジトリに書かない。設定は環境変数で

## 訳（英語と日本語）

文書は `X.md`（英語、正本）と `X.ja.md`（日本語）の組になっている（`README.md` と `README.ja.md`、`docs/*.md` など）。それぞれの 1 行目には、最後に揃えたときの相手のハッシュを書いた見えないコメントがある：

```html
<!-- i18n: pair=README.ja.md sha256=0123456789abcdef -->
```

`npm run i18n -- --check`（`npm test` と CI でも走る）は、相手が記録の後に変わった（= こちらが古い）ときと、コメントがないときに知らせる。知らせるだけで、ビルドは失敗にしない（`--strict` を付けると終了コード 1）。ハッシュはこのコメントの行・行末の違い（CRLF と LF）・行末の空白を見ない。

片方を直したら：

1. いつものように `X.md`（または `X.ja.md`）を直す。片方の言語だけ直してもよい。もう片方を直す人に検査が知らせる
2. もう片方を節ごとに追いつかせる
3. 両方が同じことを言っているのを確かめてから記録する：`npm run i18n -- --stamp X.ja.md`（組のどちらのファイルを渡してもよい。両方の 1 行目を書き直す）。見比べていない組には付けない
4. 両方のファイルをコミットする

`npm run i18n -- --stamp-all` はすべての組にまとめて付ける。揃っているとわかっている文書の組を新しく置くときだけ使う。

## ライセンス

貢献したものは [MIT License](LICENSE) で公開されることに同意したものとします。
