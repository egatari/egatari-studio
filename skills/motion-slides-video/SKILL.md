---
name: motion-slides-video
description: Egatari Studio（旧 motion-academic-slides）のデッキ（deck.html＋narration.md）を TTS（Irodori）で読み上げ、段階ごとの動画と canon 向けの教材バンドル（Marp 形式の md＋コマごとの mp4/png）にし、音声入りの Egatari 形式の 1 ファイル（.ega.html）も作る。「HTMLスライドを動画にして」「TTS動画を作って」「canonに入れる形にして」「motion-slides-video」で使う。スライドと口述原稿を作るのは motion-slides。
---

# motion-slides-video：デッキを TTS 動画と canon のバンドルにする

リポジトリ：このファイルの 2 つ上（`<repo>`。`~/.claude/skills/` にシンボリックリンク（Windows ではジャンクション）で入れたときは、リンク先の実体の 2 つ上。`realpath`（Windows の PowerShell なら `(Get-Item <パス>).Target`）で確かめる）。詳しい仕様（要るもの・環境変数・API）は `<repo>/docs/video.ja.md`、約束事は `<repo>/docs/contract.ja.md §4〜6`。

canon は TML 研究室の講義配信システム。出力は Marp 形式の md とコマごとの mp4/png という形式なので、同じ形式を受け付けるほかのシステムにも使える。

## 1. 前提を確かめる

- `node <repo>/kit/check.mjs <deck>/deck.html` が error 0（口述原稿のない段階は警告で出る。動画にするなら埋める）
- 口述原稿はユーザーが確認済みか。まだなら、先に開発サーバー（`node <repo>/server/dev.mjs <deck>/deck.html`、キー `n`）で見てもらう
- 話者：既定は 1 人モードが bob、掛け合いが bob（Expert）× alice（Novice）。変えるときは `<deck>/voice.json` か `--voices`。参照音声は `<名前>.wav` を `IRODORI_REF_DIR`（既定 `<repo>/tts/voices/`）に置く
- Irodori-TTS のサーバーが動いているか：`curl -s ${IRODORI_URL:-http://localhost:8882}/v1/models`（Windows の PowerShell では `curl` が別のコマンドになるので `curl.exe -s http://localhost:8882/v1/models`）
- ffmpeg と uv があるか

## 2. 手順

```bash
R=<repo>; D=<deck>
uv run --project $R/tts python $R/tts/synth.py $D --voices expert=bob,novice=alice
node $R/kit/build.mjs $D/deck.html                    # 音声の長さと cue をタイムラインに入れる（TTS の後に必ずやり直す）
node $R/render/render.mjs $D/out/deck.html --out $D/video [--full]
node $R/render/export-canon.mjs $D --render $D/video --out $D/bundle   # CANON_DIR があれば canon の parser でも検査
```

Windows の PowerShell では変数の書き方が違う（Git Bash なら上のままでよい）。パスに空白や日本語があれば `"…"` で囲む：

```powershell
$R = "<repo>"; $D = "<deck>"
uv run --project "$R\tts" python "$R\tts\synth.py" $D --voices expert=bob,novice=alice
node "$R\kit\build.mjs" "$D\deck.html"
node "$R\render\render.mjs" "$D\out\deck.html" --out "$D\video" --full
```

- uv を winget で入れた直後は、開いていた端末では見つからない（端末を開き直す）

- 流れだけを試すときは synth に `--dry-run`（無音・推定の長さ）。一部だけなら `--only "更新の式:2,更新の式:concl"`
- 自動再生で先に確かめられる：`<deck>/out/deck.html` を開いて `a`（音声付きで、動画と同じタイムラインで進む）
- 長さの調整は `<deck>/timeline.json` に例外だけを書き、build → render をやり直す（`{"更新の式:concl": {"pad_after": 1.5}}`）
- 音声も動画も、変わった段階だけが作り直される
- 読み辞書は `<repo>/tts/yomi.yaml`。別の辞書を使うなら `--yomi <path>` か `MOTION_YOMI`

## 3. canon への投入

export-canon が最後に表示するコマンドで、まず `--dry-run` を付けて確かめてから投入する（canon のリポジトリで `bun tools/upload-lesson.ts …`）。投入は外部のサービスへの書き込みなので、**実行前にユーザーに確認する**。

- 1 段階 = 1 コマ = 1 チャプター。サムネイル（still）は各段階の最終状態
- 話者は `Expert:` / `Novice:` だけが canon に入る（export-canon が検査する）
- `timeline.out.json` は将来の録画モード（`transcript_segment`）にそのまま使える

## 4. 音声入りの 1 ファイル（Egatari 形式）も作る

canon のバンドルとは別に、TTS の音声を入れた 1 ファイル（`.ega.html`）も作っておく。動画を使わない場で配れ、編集アプリ <https://editor.egatari.org/> で開き直して口述原稿を直せる（音声は古い段階として印が付く）。

```bash
node $R/kit/build.mjs $D --portable      # → $D/out/<名前>.ega.html（原稿・音声入り。docId は $D/egatari.json）
node $R/kit/build.mjs $D --play-only     # → $D/out/<名前>.play.ega.html（原稿なしの再生専用。学ぶ人に配るもの）
```

- TTS と build の後に作る（音声の長さが入ったタイムラインで）。ライセンス・著作権・作り手は `$D/egatari.json` の `metadata` に（motion-slides §3「教材の情報」）

## 5. よくある問題

| 症状 | 対策 |
|---|---|
| 音声がタイムラインに入らない | TTS の後に build をやり直していない |
| 読み間違い | 読み辞書（`tts/yomi.yaml` か `MOTION_YOMI` の辞書）に足すか、その箇所だけ `{φ|ファイ}`。辞書を直すと全段階が作り直しになる |
| Irodori に接続できない／参照音声がない | `IRODORI_URL`・`IRODORI_REF_DIR`（`--ref-dir`）を確かめる |
| 音声が段階に収まらず切れる | timeline.json で `dur` を固定している。`pad_after` か `hold` にする |
| dry-run の無音が残っている | export-canon の警告。本番の TTS をやり直す |

## 6. 使い終わりの感想

「感想を送って」「フィードバックして」と言われたら（または、送ってよいと前もって言われていて長い作業が終わったら）、motion-slides スキルの §9 と同じ手順で feedback の issue の下書きを作り、見せて、明示の確認の後にだけ `gh issue create -R egatari/egatari-studio --label feedback --body-file <下書き>` で作る。TTS まわり（読み間違い・音量・接続）の困りごとは Context に `via motion-slides-video` と書く。原稿の文・音声・参照音声の名前・`IRODORI_URL` などの個人の設定は入れない。
