---
name: motion-slides-video
description: Egatari Studio（旧 motion-academic-slides）のデッキ（deck.html＋narration.md）を TTS（Irodori-TTS など OpenAI 互換の音声合成サーバー）で読み上げ、段階ごとの動画と通しの動画にし、音声入りの Egatari 形式の 1 ファイル（.ega.html）も作る。「HTMLスライドを動画にして」「TTS動画を作って」「音声入りの 1 ファイルにして」「motion-slides-video」で使う。スライドと口述原稿を作るのは motion-slides。
---

# motion-slides-video：デッキを TTS の動画と音声入りの 1 ファイルにする

リポジトリ：このファイルの 2 つ上（`<repo>`。`~/.claude/skills/` にシンボリックリンク（Windows ではジャンクション）で入れたときは、リンク先の実体の 2 つ上。`realpath`（Windows の PowerShell なら `(Get-Item <パス>).Target`）で確かめる）。詳しい仕様（要るもの・環境変数・API）は `<repo>/docs/video.ja.md`、約束事は `<repo>/docs/contract.ja.md §4〜5`。

## 1. 前提を確かめる

- 品質チェック `node <repo>/kit/check.mjs <deck>/deck.html` が error 0（終了コード 2 は検査が終わっていない印で、error 0 ではない。口述原稿のない段階は警告で出る。動画にするなら埋める）
- 全スライドの最終段階を 1 枚で見たか（`node <repo>/tools/sheet.mjs <deck>/deck.html`。品質チェックでは見えない凡例・軸の端の切れなどを、画像を読めるなら Read で、読めないなら利用者に）
- 口述原稿はユーザーが確認済みか。まだなら、先に開発サーバー（`node <repo>/server/dev.mjs <deck>/deck.html`、キー `n`）で見てもらう
- 話者：既定は 1 人モードが bob、掛け合いが bob（Expert）× alice（Novice）。変えるときは `<deck>/voice.json` か `--voices`。参照音声は `<名前>.wav` を `IRODORI_REF_DIR`（既定 `<repo>/tts/voices/`）に置く
- TTS のサーバーが動いているか：`curl -s ${IRODORI_URL:-http://localhost:8882}/v1/models`（Windows の PowerShell では `curl` が別のコマンドになるので `curl.exe -s http://localhost:8882/v1/models`）。試しているのは Apple シリコンの Mac の mlx-audio。Windows・Linux では、同じ要求（`/v1/models` と `/v1/audio/speech`）に答えるほかの OpenAI 互換のサーバーを `IRODORI_URL` に向ける（`<repo>/docs/video.ja.md`「TTS のサーバー」）。サーバーがなければ、編集アプリの音声の板で段階ごとに作る・録音する道を案内する（Colab で作る道は準備中で、時期は約束しない）
- ffmpeg と uv があるか

## 2. 手順

```bash
R=<repo>; D=<deck>
uv run --project $R/tts python $R/tts/synth.py $D --voices expert=bob,novice=alice
node $R/kit/build.mjs $D/deck.html                    # 音声の長さと cue をタイムラインに入れる（TTS の後に必ずやり直す）
node $R/render/render.mjs $D/out/deck.html --out $D/video [--full]
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

- 1 段階 = 1 クリップ（`clip_NNNN.mp4`）。静止画（`clip_NNNN.png`）は各段階の最終状態。`timeline.out.json` の時刻は字幕やチャプターの印に使える
- dry-run の無音を本番に残さない（配る前に本番の TTS をやり直す）

## 3. 音声入りの 1 ファイル（Egatari 形式）も作る

動画とは別に、TTS の音声を入れた 1 ファイル（`.ega.html`）も作っておく。動画を使わない場で配れ、編集アプリ <https://studio.egatari.org/> で開き直して口述原稿を直せる（音声は古い段階として印が付く）。

```bash
node $R/kit/build.mjs $D --portable      # → $D/<教材の題名>.ega.html（原稿・音声入り。docId は $D/egatari.json）
node $R/kit/build.mjs $D --play-only     # → $D/<教材の題名>.play.ega.html（原稿なしの再生専用。学ぶ人に配るもの）
```

- TTS と build の後に作る（音声の長さが入ったタイムラインで）。ライセンス・著作権・作り手は `$D/egatari.json` の `metadata` に（motion-slides §3「教材の情報」）

## 4. よくある問題

| 症状 | 対策 |
|---|---|
| 音声がタイムラインに入らない | TTS の後に build をやり直していない |
| 読み間違い | 読み辞書（`tts/yomi.yaml` か `MOTION_YOMI` の辞書）に足すか、その箇所だけ `{φ|ファイ}`。辞書を直すと全段階が作り直しになる |
| Irodori に接続できない／参照音声がない | `IRODORI_URL`・`IRODORI_REF_DIR`（`--ref-dir`）を確かめる |
| 音声が段階に収まらず切れる | timeline.json で `dur` を固定している。`pad_after` か `hold` にする |
| Windows・Linux で TTS のサーバーがない | ほかの OpenAI 互換のサーバーを `IRODORI_URL` に（docs/video.ja.md）。なければ編集アプリで段階ごとに作る・録音する |

## 5. 使い終わりの感想

「感想を送って」「フィードバックして」と言われたら（または、送ってよいと前もって言われていて長い作業が終わったら）、motion-slides スキルの §9 と同じ手順で feedback の issue の下書きを作り、見せて、明示の確認の後にだけ `gh issue create -R egatari/egatari-studio --label feedback --body-file <下書き>` で作る。TTS まわり（読み間違い・音量・接続）の困りごとは Context に `via motion-slides-video` と書く。原稿の文・音声・参照音声の名前・`IRODORI_URL` などの個人の設定は入れない。
