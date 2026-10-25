<!-- i18n: pair=video.md sha256=388d24344d0c8fb2 -->
# 動画にする（TTS → エクスポート）

[English](video.md) | 日本語

スライドと台本（`deck.html` + `narration.md`）から、ステップごとの動画と通しの動画を作る。約束事は [contract.ja.md](contract.ja.md) §4–5。
TTS・動画のエクスポートの選択肢と環境変数の一覧は [reference.ja.md](reference.ja.md#tts)。

## 要るもの

- node（`npm install` 済み）、ffmpeg / ffprobe、[uv](https://docs.astral.sh/uv/)（TTS の Python 環境。`tts/pyproject.toml`）
- Irodori-TTS のサーバー（OpenAI 互換の HTTP API）。使うのは次の 2 つだけ
  - `GET  {IRODORI_URL}/v1/models`：起動の確認
  - `POST {IRODORI_URL}/v1/audio/speech`：1 行ずつ合成。本体は JSON
    `{"model": "mlx-community/Irodori-TTS-v4.1-Small-fp16", "input": "<文>", "ref_audio": "<参照音声の wav のパス>", "response_format": "wav"}`。
    `ref_audio` はサーバーが読むパス（サーバーが別のマシンならそちらのパス）
- 既定の参照音声 `bob` と `alice`（と `alice_en`・`bob_en`）は合成した声で、`tts/voices/` に入っている（[出どころ](../tts/voices/README.md)）。ほかの声は、wav を `<参照音声のフォルダ>/<名前>.wav` に置き、名前で指定する

| 環境変数 | 意味 | 既定 |
|---|---|---|
| `IRODORI_URL` | Irodori-TTS のサーバー | `http://localhost:8882` |
| `IRODORI_REF_DIR` | 参照音声のフォルダ（`--ref-dir` が優先） | `tts/voices/` |
| `MOTION_YOMI` | 読み辞書（`--yomi` が優先） | `tts/yomi.yaml` |

## TTS のサーバー（Mac・Windows・Linux）

`tts/synth.py` は、上の 2 つの要求に答えるサーバーならどれとでも動く。試しているのは [mlx-audio](https://github.com/Blaizzy/mlx-audio) で、これは Apple シリコンの Mac でだけ動く。ほかの道：

- **ほかの OpenAI 互換の TTS サーバー**（Windows・Linux、同じネットワークの GPU のある機械）：`GET /v1/models` に答え、`POST /v1/audio/speech` で上の JSON を受け取って WAV を返すこと。`IRODORI_URL` をそのサーバーに向ける。別の機械で動くなら、`ref_audio` はその機械の上のパス（`--ref-dir`）。`model` は Irodori-TTS か VoxCPM2 のモデル名（`tts/core.py` の `ENGINES`）で、同じモデルを別の名前で持つサーバーには名前を読み替える小さな中継が要る。`ref_audio` から声を写すサーバーなら指定した声になり、無視するサーバーはそのサーバーの声で話す
- **サーバーなし**：編集アプリの音声の板の「AI 音声をこの PC で作る」で、ステップごとにブラウザの中で音声を作る（WebGPU が要る）か、マイクで録音する（[editor.ja.md](editor.ja.md#台本の音声音声の板)）
- **Google Colab**：「AI 音声をクラウドで作る（Google Colab）」のためのノートブックと、その結果を編集アプリに取り込む機能を用意している。それまでは上のどれかを使う

## 手順

```bash
D=examples/mydeck          # deck.html と narration.md のあるフォルダ

# 1. build（タイムラインの確認用。音声はまだない）
node kit/build.mjs $D/deck.html

# 2. TTS（Irodori-TTS）
uv run --project tts python tts/synth.py $D --voices expert=bob,novice=alice
#    オフラインで流れを試すなら --dry-run（無音・7.5 字/秒の推定長）。一部だけなら --only "更新の式:2,更新の式:concl"

# 3. build し直す（audio/manifest.json を読み、音声の長さと cue をタイムラインに入れる）
node kit/build.mjs $D/deck.html

# 4. 書き出し（1280x720 × scale。1.5 で 1920x1080）
node render/render.mjs $D/out/deck.html --out $D/video [--fps 30] [--scale 1.5] [--full]

# 5.（なくてよい）音声入りの 1 ファイル。配る・編集アプリで開き直すため
node kit/build.mjs $D --portable      # 学ぶ人に配る再生専用の写しは --play-only
```

## 何ができるか

| 手順 | 出力 |
|---|---|
| tts/synth.py | `audio/seg_<digest>.wav`、`audio/seg_<digest>.json`（長さ・cue・TTS に渡した文字列）、`audio/manifest.json` `{segments:{"鍵:段階":{file,dur,cues,digest,engine}}}` |
| render.mjs | `clip_NNNN.mp4`（H.264 yuv420p・固定フレームレート・faststart、AAC 44.1kHz）、`clip_NNNN.png`（最終状態）、`timeline.out.json`。`--full` で `full.mp4`、章（`sec` スライド）が 2 つ以上なら `chapter_NN.mp4` |

- NNNN はタイムラインの通し番号（0 始まり）。1 ステップ = 1 クリップ
- `timeline.out.json` の `start_ms` / `end_ms` / `text` は、繋いだ動画の上の時刻（コマ数に丸めた長さの累積）。字幕やチャプターの印に使える

## 声

`--voices` > `<教材>/voice.json`（`{"expert": "bob", "novice": "alice"}`）> 既定（1 人モードは bob、掛け合いは Expert = bob・Novice = alice）。日本語以外の教材では、名前 `X` に `X_en.wav`（`lang="en"` のとき。一般には `X_<言語>.wav`）があればそれを、なければ `X.wav` を使う。日本語の参照音声で VoxCPM2 に英語を読ませると訛るので、声ごとに英語の参照音声を置いておく。作り方の一つ：日本語の参照音声で TTS に決まった英文（"Please call Stella" の段落など）を何度か読ませ、いちばん流暢なものを残す。名前は `<参照音声のフォルダ>/<名前>.wav`（`--ref-dir` > `IRODORI_REF_DIR` > `tts/voices/`）。voice.json にはパス（`"voices/me.wav"`、相対なら教材のフォルダから）も書ける。既定の bob・alice は手元にないことが多いので、自分の参照音声を voice.json で指定する。

各行を合成したあと、前後の無音を削り（-45 dB、0.05 s 残す）、EBU R128 の loudnorm 2 パスで -20 LUFS / TP -1.5 dB / LRA 11 に揃え、行間 350 ms の無音を挟んで繋ぐ（`tts/core.py`）。

## 読み辞書

`tts/yomi.yaml`（`--yomi` か `MOTION_YOMI` で別の辞書に差し替えられる）を `tts/yomi.py` の規則で掛ける。`terms` は必ず仮名に置換（最長一致、より長い漢字語・英単語の一部なら置換せず警告、日本語を含まない発話には掛けない）、`watch` は文脈で読みが変わる語の報告だけ、`watch_kanji` は誤読の原因になった字を含む未登録語の警告。足すのは「誤読を実測し、仮名化で直ることを確かめた語」だけにする（正しく読める語を仮名にすると韻律が落ちる）。辞書の前に、マイナス記号 `−`（U+2212）は必ず「マイナス」にする（自分の辞書でも、日本語を含まない発話でも）。Irodori-TTS の文字の正規化がダッシュの仲間として消すため、そのままでは `−1` が「1」と読まれる（編集アプリの「AI 音声をこの PC で作る」も同じ規則。`kit/core/yomi.mjs`）。

## 音声入りの HTML

`node kit/build.mjs <deck>/deck.html --embed-audio` で音声を HTML に埋め込む。WAV は ffmpeg で AAC（64 kbps・モノラル、`.m4a`）にしてから埋め込む（結果は一時フォルダにキャッシュ）。ffmpeg がなければ WAV のまま入れて警告する。`--embed-audio` なしでは `audio/` の WAV を相対パスで参照する。

## エンジンと言語

`--engine` > `voice.json` の `"engine"` > 教材の `<html lang>`（`ja` なら `irodori`、それ以外は `voxcpm2`）。どちらも同じ mlx-audio のサーバーで、モデル名だけが違う（`tts/core.py` の `ENGINES`）。日本語以外では読み辞書を使わない。

```json
{"lang": "en", "engine": "voxcpm2", "expert": "me"}
```

## キャッシュ

- **音声**：`seg_<digest>.wav` があれば合成しない。digest は `segDigest`（kit/narration.mjs）に、話者・TTS 用の文字列・声・モデル・音量の目標・行間・無音除去の設定・読み辞書と適用規則（実際に使った辞書と `tts/yomi.py`）のハッシュを入れたもの。どれかが変われば作り直す（辞書を直すと全ステップが作り直しになる）。dry-run は別の digest なので本番の音声と混ざらない。`--force` で作り直し
- **動画**：ステップごとに「最終状態の画素・動きの途中の 1 コマの画素・音声ファイルの中身・dur・lead・anim・fps・scale」のハッシュを `<out>/.render-cache.json` に控え、同じなら作らない。画面を撮って比べるので、CSS・パーツ・テーマを直しても正しく作り直される（使う字が増えて字の埋め込みが変わると、見た目が同じでも作り直しになることがある）。`--force` で全部作り直し
- ステップが減ると、余った `clip_NNNN.*` は消す（連番がずれないように）

## 長さの調整（timeline.json）

ステップの長さは `DECK.timeline()` が決める（自動再生と動画のエクスポートで同じ）：`dur = override.dur ?? max(anim, 音声 ? lead + 音声 + pad_after : hold)`。既定は lead 0.25 s、pad_after 0.6 s、hold 1.2 s。例外だけを `<教材>/timeline.json` に書き、**build し直してから** render する。

```json
{"学習率と収束:concl": {"pad_after": 2.0}, "何を最小化するか:1": {"hold": 2.5}, "更新の式:0": {"dur": 6}}
```

- `pad_after` / `hold` / `lead` は音声との関係を保って伸ばす。`dur` は固定（音声が lead + dur を超えると末尾を切り、render が警告する）
- 動きの区間（anim）だけを fps で撮り、残りは最終状態の 1 枚を伸ばす。長さを変えても撮るコマは増えない
- 音声は lead 秒の無音のあとに置き、dur まで無音で埋める。クリップの長さは dur を 1/fps に丸めたもの
