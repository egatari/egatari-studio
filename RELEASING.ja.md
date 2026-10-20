<!-- i18n: pair=RELEASING.md sha256=375c892fa04c9f7b -->
# リリースの仕方

[English](RELEASING.md) | 日本語

リリースは `main` の上のタグ `vX.Y.Z`。リリースの候補はタグ `vX.Y.Z-rc.N` で、評価はするが置かない（deploy しない）。GitHub Pages（配信版の編集アプリ）はリリースのタグからだけ置く（`.github/workflows/pages.yml`。設定は [docs/editor.ja.md](docs/editor.ja.md#github-pages-で配る)）。

## 手順

1. **候補。** リリースする `main` のコミットに候補のタグを付けて push する：

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

   **個人の環境に頼らない。** 版のどこも、保守する人の機械を前提にしない：個人のパス・アドレス・秘密・声、`skills/` にないスキル。`tools/test-selfcontained.mjs` がこれを確かめる（`npm test` と CI に入っている。3 を見る）。リリースのコミットでもう一度走らせる：

   ```bash
   node tools/test-selfcontained.mjs
   ```

   `main` を push し、CI がまた通るのを待つ
6. **タグ。** リリースのコミットにタグを付けて push する。これで GitHub Pages に置かれる：

   ```bash
   git tag -a vX.Y.Z -m vX.Y.Z && git push origin vX.Y.Z
   ```

7. **リリースの説明**を CHANGELOG の節から作り、見本のファイルを添える：

   ```bash
   awk '/^## \[X\.Y\.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md > /tmp/notes.md
   npm run release:assets
   gh release create vX.Y.Z --title vX.Y.Z --notes-file /tmp/notes.md out/release/*
   ```

8. **Pages。** タグの `pages` workflow が置く。置けたことを確かめ（`gh run list --workflow pages --limit 3`）、<https://studio.egatari.org/> を開く。同じ版を置き直すには、そのタグで workflow を走らせる（Actions → pages → Run workflow）
   ブラウザが受け取る圧縮した応答も確かめる：`curl -s -o /dev/null -w "%{http_code}" -H "Accept-Encoding: gzip, deflate, br, zstd" https://studio.egatari.org/` が `200` を出すこと（圧縮した 404 がキャッシュに残り、ドメインを替えても消えないことがある）
