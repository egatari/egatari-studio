<!-- i18n: pair=RELEASING.md sha256=736414e27b9c181b -->
# リリースの仕方

[English](RELEASING.md) | 日本語

リリースは `main` の上のタグ `vX.Y.Z`。リリースの候補はタグ `vX.Y.Z-rc.N` で、評価はするが置かない（deploy しない）。GitHub Pages（配信版の編集アプリ）はリリースのタグからだけ置く（`.github/workflows/pages.yml`。設定は [docs/editor.ja.md](docs/editor.ja.md#github-pages-で配る)）。

## 手順

1. **候補。** 先に `kit/core/colab-core.mjs` の `COLAB.ref` をリリースのタグ `vX.Y.Z` にし（エディタの Colab へのリンクとノートブックの clone が使う）、`npm run gen` してコミットする。そのうえで、リリースする `main` のコミットに候補のタグを付けて push する：

   **同梱のプレーヤー。** ファイルは `player` {name, version} を持つ（形式の仕様 §4.1）。`kit/player.json` に Egatari Player の版、`kit/player.lock.json` に最後にリリースしたプレーヤーの版と SHA-256（`kit/core/player.mjs` の `PLAYER_FILES` のファイル：`kit/deck.js` とそれが入れる `kit/core` のモジュール、`presenter.js`・`tools.js`・`shape.js`、実行系の CSS、ライブのプレーヤー）がある。プレーヤーのファイルが lock と同じ組み立ては版をそのまま書き、ほかは `<版>+dev.<commit>`（git がなければ `+dev`）を書く。候補のタグを付ける前に `npm run player:check -- --strict` を走らせ、前のリリースからプレーヤーが変わっていれば `npm run player:bump -- patch|minor|major`（最初のリリースは `major` で 1.0.0）、`changes/player-<版>.md` を書き足し、`npm run gen:check` してコミットする（候補のファイルが版をそのまま持つように）。ブランチでは `npm run player:check` は知らせるだけ。

   **仕様の日付の版。** 候補のタグを付ける前に、`vendor/egatari-spec` が egatari-spec の最新の `wd-*` の版と同じであること（`vendor/egatari-spec/SOURCE.json` に `"snapshot": "wd-YYYY-MM-DD"` があり、`node tools/spec-snapshot.mjs --check` が `ok` と出す）。写すには `node tools/sync-spec.mjs <仕様の clone> --ref wd-YYYY-MM-DD`。最新の版のあとで仕様が変わっていたら、先に仕様の担当者に新しい版を切ってもらう。

   ```bash
   git tag -a vX.Y.Z-rc.N -m vX.Y.Z-rc.N && git push origin vX.Y.Z-rc.N
   ```

2. **評価。** 管理者の夜ごとの評価（形式の仕様の実験の道具で回すもの。候補の commit の要約を管理者に頼む）で、段 A（保存した返答の採点し直し）の差分が **0**（0 でなければ、差分がどれも意図した変更か確かめる）、段 B（新しく作らせたもの）の直し後の通過率が、直近の晩より大きく下がっていないこと。そうでなければ `main` で直して、新しい候補を作る
3. **`main` の CI が緑。** 候補のコミットで `test` と `pages`（組むだけ）の workflow が通っている：`gh run list --branch main --limit 5`
   `test` の workflow には自己完結の確認（backlog #50）が入っている。どれも緑であること：
   - `npm test` を Linux（Node 22 と 24）・Windows・**macOS** で（`test`・`windows`・`macos` のジョブ）
   - `tools/test-selfcontained.mjs`（`npm test` に入っている）：追跡しているファイルに個人のパス・私的な網の番地・秘密の置き場所・個人の声の名前がない。`localhost:8882` は `IRODORI_URL` の既定としてだけ書く。`skills/` が挙げるのは同梱のスキルだけ。文書が挙げるパス・リンク・`npm run` の script が実在する。`kit/` と `server/` が `tts/` と `render/` を import しない
   - `clean` のジョブを Linux・Windows・macOS で：空の `HOME`・TTS のサーバーなしで `node tools/clean-env.mjs` が、見本ごとに組む・品質チェックをかける・書き出す（`--portable`・`--play-only`）、`tts/synth.py --dry-run` の音声で組む、`npm run new` のデッキを組む。手元でも走らせる：`node tools/clean-env.mjs`
4. **CHANGELOG。** 節を確かめてからまとめる（`package.json` と `package-lock.json` の版も変え、`changes/*.md` を消す）：

   ```bash
   node tools/changelog.mjs --preview X.Y.Z
   node tools/changelog.mjs --release X.Y.Z
   npm run gen:check
   git commit -am "vX.Y.Z：CHANGELOG を版にまとめ、版を X.Y.Z にする"
   ```

   候補とこのコミットの違いは `CHANGELOG.md`・`changes/`・版だけにする
5. **セッションのリンクを入れない。** push の前に毎回（コミットもタグも）：

   ```bash
   git log origin/main..HEAD --format=%B | grep -ci claude-session   # 0 でなければならない
   ```

   **個人の環境に頼らない。** 版のどこも、保守する人のパソコンを前提にしない：個人のパス・アドレス・秘密・声、`skills/` にないスキル。`tools/test-selfcontained.mjs` がこれを確かめる（`npm test` と CI に入っている。3 を見る）。リリースのコミットでもう一度走らせる：

   ```bash
   node tools/test-selfcontained.mjs
   ```

   `main` を push し、CI がまた通るのを待つ
6. **タグ。** リリースのコミットにタグを付けて push する。これで GitHub Pages に置かれる：

   ```bash
   git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
   ```

7. **リリースの説明**を CHANGELOG の節から作る。説明には従う仕様の版を書く：「Egatari 1.0 WD YYYY-MM-DD に従う」（英語では “Follows Egatari 1.0 Working Draft YYYY-MM-DD”）。例外があれば書く。見本のファイルと編集アプリのサイトを添える。編集アプリのサイト `editor-site-vX.Y.Z.tar.gz` はこのリリースの `dist/` で、タグの一時的な git worktree で組む。後の deploy がこれを `/vX.Y.Z/` に置き、説明の sha256 の行と合うか確かめる（[docs/editor.ja.md](docs/editor.ja.md#版ごとの-url凍結した写し)）：

   ```bash
   awk '/^## \[X\.Y\.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md > /tmp/notes.md
   npm run release:assets
   node tools/site-versions.mjs asset vX.Y.Z          # out/site/editor-site-vX.Y.Z.tar.gz とその sha256 の行
   printf '\n' >> /tmp/notes.md && cat out/site/editor-site-vX.Y.Z.sha256.txt >> /tmp/notes.md
   gh release create vX.Y.Z --title vX.Y.Z --notes-file /tmp/notes.md out/release/* out/site/editor-site-vX.Y.Z.tar.gz
   node tools/site-versions.mjs verify vX.Y.Z         # 添えたファイルを取り、説明と GitHub の digest に合うか確かめる
   ```

8. **Pages。** タグの `pages` workflow が置く。置けたことを確かめ（`gh run list --workflow pages --limit 3`）、<https://studio.egatari.org/>・<https://studio.egatari.org/vX.Y.Z/>・前のリリースの `/v…/` を開く（その記録に、置いた凍結した写しが並ぶ）。同じ版を置き直すには、そのタグで workflow を走らせる（Actions → pages → Run workflow）
   ブラウザが受け取る圧縮した応答も確かめる：`curl -s -o /dev/null -w "%{http_code}" -H "Accept-Encoding: gzip, deflate, br, zstd" https://studio.egatari.org/` が `200` を出すこと（圧縮した 404 がキャッシュに残り、ドメインを替えても消えないことがある）
