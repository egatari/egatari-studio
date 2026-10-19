<!-- i18n: pair=RELEASING.md sha256=955c9b8961b3a1b4 -->
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

8. **Pages。** タグの `pages` workflow が置く。置けたことを確かめ（`gh run list --workflow pages --limit 3`）、<https://editor.egatari.org/> を開く。同じ版を置き直すには、そのタグで workflow を走らせる（Actions → pages → Run workflow）
