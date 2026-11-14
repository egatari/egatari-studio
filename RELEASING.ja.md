<!-- i18n: pair=RELEASING.md sha256=88016a718253292d -->
# リリースの仕方

[English](RELEASING.md) | 日本語

リリースは `main` の上のタグ `vX.Y.Z`。リリースの候補はタグ `vX.Y.Z-rc.N` で、評価はするが置かない（deploy しない）。GitHub Pages（配信版の編集アプリ）はリリースのタグからだけ置く（`.github/workflows/pages.yml`。設定は [docs/editor.ja.md](docs/editor.ja.md#github-pages-で配る)）。

## 手順

1. **候補。** 先に `kit/core/colab-core.mjs` の `COLAB.ref` をリリースのタグ `vX.Y.Z` にし（エディタの Colab へのリンクとノートブックの clone が使う）、`npm run gen` してコミットする。そのうえで、リリースする `main` のコミットに候補のタグを付けて push する：

   **同梱のプレーヤー。** ファイルは `player` {name, version} を持つ（形式の仕様 §4.1）。`kit/player.json` に Egatari Player のバージョン、`kit/player.lock.json` に最後にリリースしたプレーヤーのバージョンと SHA-256（`kit/core/player.mjs` の `PLAYER_FILES` のファイル：`kit/deck.js` とそれが入れる `kit/core` のモジュール、`presenter.js`・`tools.js`・`shape.js`、実行系の CSS、ライブのプレーヤー）がある。本の組版の CSS（`kit/core/article-render.mjs` の `ARTICLE_CSS`）は、テーマやスライドの CSS と同じく、組み立てが教材の中に書き出すものなので、プレーヤーのハッシュではなく `generator` のバージョンで区別する。プレーヤーのファイルが lock と同じ組み立てはバージョンをそのまま書き、ほかは `<版>+dev.<commit>`（git がなければ `+dev`）を書く。候補のタグを付ける前に `npm run player:check -- --strict` を走らせ、前のリリースからプレーヤーが変わっていれば `npm run player:bump -- patch|minor|major`（最初のリリースは `major` で 1.0.0）、`changes/player-<版>.md` を書き足し、`npm run gen:check` してコミットする（候補のファイルがバージョンをそのまま持つように）。ブランチでは `npm run player:check` は知らせるだけ。

   **仕様の日付のバージョン。** 候補のタグを付ける前に、`vendor/egatari-spec` が egatari-spec の最新の `wd-*` のバージョンと同じであること（`vendor/egatari-spec/SOURCE.json` に `"snapshot": "wd-YYYY-MM-DD"` があり、`node tools/spec-snapshot.mjs --check` が `ok` と出す）。写すには `node tools/sync-spec.mjs <仕様の clone> --ref wd-YYYY-MM-DD`。最新のバージョンのあとで仕様が変わっていたら、先に仕様の担当者に新しいバージョンを切ってもらう。

   **字の切り出しのツール。** `harfbuzzjs` と `wawoff2` は `package.json` でバージョンをちょうどに固定する（`kit/core/font-subset-core.mjs` の `SUBSET_PINS`）。これらと `@fontsource` の包みが、埋め込む字のバイトを決める。バージョンを上げると出力が変わる（KaTeX のバージョンを上げるのと同じ）：`SUBSET_PINS` と `tools/test-font-subset.mjs` の固定した sha256 を直し（`PRINT_PINS=1 node tools/test-font-subset.mjs` で出る）、`changes/` に書く。

   **`package.json` のバージョン。** `npm.yml` は、タグが `v` + `package.json` の `version` に等しいときだけ公開する。そこで候補のタグを付ける前に、バージョンを候補のバージョンにする（候補は dist-tag `next` に出て、`latest` は直近のリリースのまま）。`--rc` はバージョンだけを、手順 4 と同じファイル（`package.json`・`package-lock.json`・2 つの `plugin.json`・2 つの `marketplace.json`）で変え、`node tools/make-llm-guide.mjs` を動かし直して、スキルの docs へのリンクと CLI のマイナーバージョンをバージョンに合わせる（`npm run gen:check` と `tools/test-plugin.mjs` は、どれも `package.json` と同じであることを求める）。`CHANGELOG.md` と `changes/` には触らない：

   ```bash
   node tools/changelog.mjs --rc X.Y.Z-rc.N
   npm run gen:check
   git commit -am "vX.Y.Z-rc.N：バージョンを X.Y.Z-rc.N にする"
   git tag -a vX.Y.Z-rc.N -m vX.Y.Z-rc.N && git push origin main vX.Y.Z-rc.N
   ```

   次の候補はこれを次の N で繰り返す。手順 4（`--release X.Y.Z`）でバージョンが候補でない `X.Y.Z` に戻る。編集アプリのサイトは、候補のバージョンを「リリースでない」ものとして扱う：`tools/site-versions.mjs assemble` は受け付けるが `/v…/` の写しは作らず、バージョンの一覧はリリースだけにする（候補のタグへの「Run workflow」は組み立ての試走だけ。`pages.yml` は候補を置かない）。

2. **評価。** 管理者の夜ごとの評価（形式の仕様の実験のツールで回すもの。候補の commit の要約を管理者に頼む）で、段 A（保存した返答の採点し直し）の差分が **0**（0 でなければ、差分がどれも意図した変更か確かめる）、段 B（新しく作らせたもの）の直し後の通過率が、直近の晩より大きく下がっていないこと。そうでなければ `main` で直して、新しい候補を作る
3. **`main` の CI が緑。** 候補のコミットで `test` と `pages`（組むだけ）の workflow が通っている：`gh run list --branch main --limit 5`
   `test` の workflow には自己完結の確認（backlog #50）が入っている。どれも緑であること：
   - `npm test` を Linux（Node 22 と 24）・Windows・**macOS** で（`test`・`windows`・`macos` のジョブ。Linux と Windows は 3 つの段を同時に、macOS は 2 つずつでメモリを多く使う段どうしは重ねない。時間に敏感な試験は最後に 1 つずつ）。**どこで何を走らせるか：** Linux と Windows は毎回すべて。macOS ですべての `npm test`（と `clean`・`pack` の macOS の分）を走らせるのは、`main` への push、`v*` のタグ（リリースと rc）の push、`full=true` を付けた手動の実行（`gh workflow run test.yml --ref <ブランチ> -f full=true`）だけ。ブランチの手動の実行と PR では、macOS は OS に左右されるところだけを 1 つのジョブで走らせる（`npm test -- --platform`：組み立て・品質チェック・単体の検査と、`// test-all: platform` の印のある試験（パス・字体・WebKit・npm の包み）。そのあと `node tools/clean-env.mjs`）。**rc のタグには、そのコミットで 3 つの OS のすべての試験が 1 回通して緑の実行が要る**（`main` への push・タグ・`full=true` の実行のどれか。落ちたジョブの再実行は 1 回まで、落ちたものはすべて書き留める）。macOS の待ちの上限は 3 倍（`TEST_TIMEOUT_SCALE=3`、`tools/wait-scale.mjs`）。そこで落ちて単独では通る試験があれば、`npm test -- --jobs 1` で、ほかと同時に走らせると崩れる試験か本当の失敗かを見分ける
   - `tools/test-selfcontained.mjs`（`npm test` に入っている）：追跡しているファイルに個人のパス・私的な網の番地・秘密の置き場所・個人の声の名前がない。`localhost:8882` は `IRODORI_URL` の既定としてだけ書く。`skills/` が挙げるのは同梱のスキルだけ。文書が挙げるパス・リンク・`npm run` の script が実在する。`kit/` と `server/` が `tts/` と `render/` を import しない
   - `clean` のジョブを Linux・Windows・macOS で（macOS はすべての試験を走らせる実行だけ。ほかは `macos` のジョブが試験の後に走らせる）：空の `HOME`・TTS のサーバーなしで `node tools/clean-env.mjs` が、見本ごとに組む・品質チェックをかける・書き出す（`--portable`・`--play-only`）、`tts/synth.py --dry-run` の音声で組む、`npm run new` のデッキを組む。手元でも走らせる：`node tools/clean-env.mjs`
   - `pack` のジョブを Linux・Windows・macOS で（macOS はすべての試験を走らせる実行だけ。ほかは `macos` のジョブの `test-npm-pack`）：`node tools/test-npm-pack.mjs` が npm の包み `egatari` を作り、リポジトリの外に入れて `npx egatari`（`--version`・`doctor`・`new`・`check`・`build`・`build --portable`）を動かす
4. **CHANGELOG。** 節を確かめてからまとめる（`package.json` と `package-lock.json` のほか、2 つの `plugin.json` と `.claude-plugin/marketplace.json`・`.agents/plugins/marketplace.json` のプラグインの項目のバージョンも変える。入れた Claude Code・Codex はこのバージョンを見て更新する。`changes/*.md` を消し、`node tools/make-llm-guide.mjs` を動かし直す。スキルが docs へのリンクを `v<版>` の札に固定し、更新のコマンドに CLI のマイナーバージョンを書いているため。どれかのバージョンが `package.json` と違えば `tools/test-plugin.mjs` が失敗する）：

   ```bash
   node tools/changelog.mjs --preview X.Y.Z
   node tools/changelog.mjs --release X.Y.Z
   npm run gen:check
   git commit -am "vX.Y.Z：CHANGELOG をバージョンにまとめ、バージョンを X.Y.Z にする"
   ```

   候補とこのコミットの違いは、`CHANGELOG.md`・`changes/`・バージョン（`package.json`・`package-lock.json`・`.claude-plugin/plugin.json`・`plugins/egatari/.claude-plugin/plugin.json`・`.claude-plugin/marketplace.json`・`.agents/plugins/marketplace.json`）と、`make-llm-guide.mjs` がバージョンから作り直すもの（スキルの docs へのリンク：`plugins/egatari/skills/make/references/book.md`・`references/en/book.md`・`skills/studio/SKILL.md`。更新のコマンドの CLI のマイナーバージョン：`plugins/egatari/skills/make/SKILL.md`・`SKILL.en.md`。スキルのバージョンの行：その 2 つと `skills/studio/SKILL.md`）だけにする
5. **セッションのリンクを入れない。** push の前に毎回（コミットもタグも）：

   ```bash
   git log origin/main..HEAD --format=%B | grep -ci claude-session   # 0 でなければならない
   ```

   **個人の環境に頼らない。** バージョンのどこも、保守する人のパソコンを前提にしない：個人のパス・アドレス・秘密・声、`skills/` にないスキル。`tools/test-selfcontained.mjs` がこれを確かめる（`npm test` と CI に入っている。3 を見る）。リリースのコミットでもう一度走らせる：

   ```bash
   node tools/test-selfcontained.mjs
   ```

   `main` を push し、CI がまた通るのを待つ
6. **タグ。** リリースのコミットにタグを付けて push する。これで GitHub Pages に置かれ、npm の包み `egatari` が出所の証明（provenance）つきで公開される（`.github/workflows/npm.yml`：vX.Y.Z は `latest`、候補のタグは `next`。trusted publishing でトークンは置かない。リポジトリの変数 `NPM_PUBLISH` が `true` のときだけ）：

   ```bash
   git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
   ```

7. **リリースの説明**を CHANGELOG の節から作る。説明には従う仕様のバージョンを書く：「Egatari 1.0 WD YYYY-MM-DD に従う」（英語では “Follows Egatari 1.0 Working Draft YYYY-MM-DD”）。例外があれば書く。見本のファイル、両言語の make スキルの ZIP（`npm run release:assets` が作る `egatari-make-X.Y.Z-ja.zip` と `egatari-make-X.Y.Z-en.zip`）、編集アプリのサイトを添える。編集アプリのサイト `editor-site-vX.Y.Z.tar.gz` はこのリリースの `dist/` で、タグの一時的な git worktree で組む。後の deploy がこれを `/vX.Y.Z/` に置き、説明の sha256 の行と合うか確かめる（[docs/editor.ja.md](docs/editor.ja.md#バージョンごとの-url凍結した写し)）：

   ```bash
   awk '/^## \[X\.Y\.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md > /tmp/notes.md
   npm run release:assets
   node tools/site-versions.mjs asset vX.Y.Z          # out/site/editor-site-vX.Y.Z.tar.gz とその sha256 の行
   printf '\n' >> /tmp/notes.md && cat out/site/editor-site-vX.Y.Z.sha256.txt >> /tmp/notes.md
   gh release create vX.Y.Z --title vX.Y.Z --notes-file /tmp/notes.md out/release/* out/site/editor-site-vX.Y.Z.tar.gz
   node tools/site-versions.mjs verify vX.Y.Z         # 添えたファイルを取り、説明と GitHub の digest に合うか確かめる
   ```

8. **Pages。** タグの `pages` workflow が置く。置けたことを確かめ（`gh run list --workflow pages --limit 3`）、<https://studio.egatari.org/>・<https://studio.egatari.org/vX.Y.Z/>・前のリリースの `/v…/`・<https://studio.egatari.org/parts/>（すべてのパーツのサンプル）を開く（その記録に、置いた凍結した写しと、各バージョンのページをどのリリースから取ったかが並ぶ）。同じバージョンを置き直すには、そのタグで workflow を走らせる（Actions → pages → Run workflow）
   **前のリリースは 1 つだけ。** サイトに置くのは今のバージョンと、その 1 つ前のリリースだけ（`tools/site-versions.mjs` の `KEEP_PREVIOUS`。2026-11-11 の作者の決定）。それより前は下の短いページになる。リリースのときにすることはない（自動で入れ替わる）
   **置くバージョンの下限。** `tools/site-versions.mjs` の `HOSTED_FROM`（いまは `0.6.0`。2026-11-06 の作者の決定）より前のリリースは広げない。その `/vX.Y.Z/` は、GitHub のリリースと最新版へのリンクを出す日本語と英語の短いページになり、記録にはバージョンごとに 1 行が出る。バージョンの一覧には出ない。サイトが 800 MB を超えた知らせ（1 GB を超えると失敗）が出たら、その知らせが置いている最も古いバージョンを挙げるので、`HOSTED_FROM` を知らせの勧めるバージョンにするコミットを `main` に入れ、もう一度置く。リリースに添えたファイルはそのままでよい。ファイルの名前を `editor-site-vX.Y.Z.tar.gz` に戻しても、下限より前のバージョンはまた置かれない（[docs/editor.ja.md](docs/editor.ja.md#バージョンごとの-url凍結した写し)）
   ブラウザが受け取る圧縮した応答も確かめる：`curl -s -o /dev/null -w "%{http_code}" -H "Accept-Encoding: gzip, deflate, br, zstd" https://studio.egatari.org/` が `200` を出すこと（圧縮した 404 がキャッシュに残り、ドメインを替えても消えないことがある）

## @egatari/fonts-extra

包み `egatari` が持つのは既定の字体（BIZ UDPゴシック・BIZ UDP明朝・Source Sans 3）と、同梱のテーマが使う字体（`asagi` の Zen Maru Gothic、`bengara` の Fraunces）で、同梱のテーマはどれも `npx egatari` だけで組める（同梱のテーマが `extra` の字体を名指すと `tools/test-fonts.mjs` が失敗する）。ほかの選べる 6 つの字体（`kit/core/build-core.mjs` の `FONT_LIST` の `extra`）は、`packages/fonts-extra/` の別の包み `@egatari/fonts-extra` で、バージョンも別に持つ。`egatari` はそれを任意の peer dependency（`^1.0.0`）に挙げる。写しは `tools/fonts-vendor.mjs`（その包みと `egatari` の `prepack`）が `@fontsource` の devDependencies から作り、`tools/test-npm-pack.mjs` がそれを pack して、選べる字体の教材を組む。新しいバージョンは、その字体が変わるときだけ出す（選べる字体の `@fontsource` の devDependencies を上げた、一覧か太さを変えた。同梱のテーマがそのどれかを使い始めたら、その字体は `extra` を外して `egatari` に戻す）。

**初めての公開（手で 1 回）。** スコープのある包みは、あってからでないと trusted publishing を設定できない。リリースのコミットのきれいな checkout で、`@egatari` のスコープの owner として npm にサインインして：

```bash
npm ci
cd packages/fonts-extra
npm pack --dry-run          # 6 つの字体があり、egatari の字体はない。prepack が @fontsource/ を作る
npm publish --access public
```

それから npmjs.com で、包み `@egatari/fonts-extra` → Settings → Trusted publishing → GitHub Actions に次を書く：

| 欄 | 値 |
|---|---|
| Organization or user | `egatari` |
| Repository | `egatari-studio` |
| Workflow filename | `npm-fonts-extra.yml` |
| Environment name | `npm` |

環境 `npm` が置けるタグを限っているなら（Settings → Environments → npm）、`fonts-extra-v*` も許す。

**次からのバージョン。** `packages/fonts-extra/package.json` の `version` を上げ（major を上げるときは、ルートの `package.json` の peer の範囲も）、マージしてから、そのコミットにタグを付けて push する。`.github/workflows/npm-fonts-extra.yml` がタグとバージョンが同じかを確かめ、`tools/test-npm-pack.mjs` を走らせて、出所の証明（provenance）つきで公開する（`NPM_PUBLISH` が `true` のときだけ）：

```bash
git tag -a fonts-extra-vX.Y.Z -m fonts-extra-vX.Y.Z && git push origin fonts-extra-vX.Y.Z
```
