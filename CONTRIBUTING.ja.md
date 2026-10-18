<!-- i18n: pair=CONTRIBUTING.md sha256=78e0aab546bdb6a3 -->
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
- [ ] `node tools/catalog.mjs` を走らせた（CATALOG.md は生成物。手で直さない）
- [ ] `npm test` が通る

## テストの走らせ方

```bash
npm install
npm test                 # 全部（Chrome か Playwright の Chromium が要る）
node tools/test-all.mjs --only test-components,test-tools
```

CI は push と PR ごとに Node 22 と 24 で `npm test` を回す。

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
