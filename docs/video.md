# 動画にする（TTS → 書き出し → canon）

デッキ（`deck.html` + `narration.md`）から、段階ごとの動画と canon 向けの教材バンドルを作る。約束事は `docs/contract.md` §4–6。

canon は TML 研究室の講義配信システム。出力は Marp 形式の md とコマごとの mp4/png という形式なので、同じ形式を受け付けるほかのシステムにも使える。

## 要るもの

- node（`npm install` 済み）、ffmpeg / ffprobe、[uv](https://docs.astral.sh/uv/)（TTS の Python 環境。`tts/pyproject.toml`）
- Irodori-TTS のサーバー（OpenAI 互換の HTTP API）。使うのは次の 2 つだけ
  - `GET  {IRODORI_URL}/v1/models`：起動の確認
  - `POST {IRODORI_URL}/v1/audio/speech`：1 行ずつ合成。本体は JSON
    `{"model": "mlx-community/Irodori-TTS-v4.1-Small-fp16", "input": "<文>", "ref_audio": "<参照音声の wav のパス>", "response_format": "wav"}`。
    `ref_audio` はサーバーが読むパス（サーバーが別のマシンならそちらのパス）
- 参照音声（声のクローン元の wav）は自分で用意する。`<参照音声のフォルダ>/<名前>.wav` に置き、名前で指定する
- canon の parser での検査をするなら、canon のリポジトリと bun（なければその検査だけを飛ばす）

| 環境変数 | 意味 | 既定 |
|---|---|---|
| `IRODORI_URL` | Irodori-TTS のサーバー | `http://localhost:8882` |
| `IRODORI_REF_DIR` | 参照音声のフォルダ（`--ref-dir` が優先） | `tts/voices/`（git 管理外） |
| `MOTION_YOMI` | 読み辞書（`--yomi` が優先） | `tts/yomi.yaml` |
| `CANON_DIR` | canon のリポジトリ（`--canon` が優先）。export-canon の parser 検査に使う | なし（検査を飛ばす） |

## 手順

```bash
D=examples/mydeck          # deck.html と narration.md のあるフォルダ

# 1. build（タイムラインの確認用。音声はまだない）
node kit/build.mjs $D/deck.html

# 2. TTS（Irodori-TTS）
uv run --project tts python tts/synth.py $D --voices expert=alice,novice=bob
#    オフラインで流れを試すなら --dry-run（無音・7.5 字/秒の推定長）。一部だけなら --only "更新の式:2,更新の式:concl"

# 3. build し直す（audio/manifest.json を読み、音声の長さと cue をタイムラインに入れる）
node kit/build.mjs $D/deck.html

# 4. 書き出し（1280x720 × scale。1.5 で 1920x1080）
node render/render.mjs $D/out/deck.html --out $D/video [--fps 30] [--scale 1.5] [--full]

# 5. canon のバンドル
CANON_DIR=<canon のリポジトリ> node render/export-canon.mjs $D --render $D/video --out $D/bundle
#    → 表示されたコマンドで投入（canon のリポジトリで bun tools/upload-lesson.ts … --dry-run で確認してから）
```

## 何ができるか

| 手順 | 出力 |
|---|---|
| tts/synth.py | `audio/seg_<digest>.wav`、`audio/seg_<digest>.json`（長さ・cue・TTS に渡した文字列）、`audio/manifest.json` `{segments:{"鍵:段階":{file,dur,cues,digest,engine}}}` |
| render.mjs | `clip_NNNN.mp4`（H.264 yuv420p・固定フレームレート・faststart、AAC 44.1kHz）、`clip_NNNN.png`（最終状態）、`timeline.out.json`。`--full` で `full.mp4`、章（`sec` スライド）が 2 つ以上なら `chapter_NN.mp4` |
| export-canon.mjs | `<名前>_with_narration.md`、`clips_per_page/clip_NNNN.mp4`、`stills/clip_NNNN.png`、`timeline.out.json` |

- NNNN はタイムラインの通し番号（0 始まり）＝ canon のチャプターの seq。1 段階 = 1 ページ = 1 チャプター
- md は段階 0 が新しいスライド、段階 1 以降が `<!-- _paginate: hold -->`。口述原稿は `<!-- 口述原稿（コマN）：` の中に `Expert:` / `Novice:` の行（話者のない行は Expert）。表示用の文字列（`{cue}` を除き、`{φ|ファイ}` は φ）
- export-canon はページ数と話者の行を自前の規則で確かめる。`CANON_DIR`（`--canon`）があれば canon 自身の parser（`src/server/marp.ts`）も bun で動かし、チャプター数・スライド数・コマ・題名・原稿の行数が合うかを確かめる（なければ 1 行断って飛ばす）。80MB を超える動画、話者のない行は失敗にする。原稿のないページ、dry-run の音声が残っていることは警告
- `timeline.out.json` の `start_ms` / `end_ms` / `text` は、繋いだ動画の上の時刻（コマ数に丸めた長さの累積）。録画モードの `transcript_segment` にそのまま使える

## 声

`--voices` > `<デッキ>/voice.json`（`{"expert": "alice", "novice": "bob"}`）> 既定（1 人モードは alice、掛け合いは Expert = alice・Novice = bob）。名前は `<参照音声のフォルダ>/<名前>.wav`（`--ref-dir` > `IRODORI_REF_DIR` > `tts/voices/`）。voice.json にはパス（`"voices/me.wav"`、相対ならデッキから）も書ける。既定の alice・bob は手元にないことが多いので、自分の参照音声を voice.json で指定する。

各行を合成したあと、前後の無音を削り（-45 dB、0.05 s 残す）、EBU R128 の loudnorm 2 パスで -20 LUFS / TP -1.5 dB / LRA 11 に揃え、行間 350 ms の無音を挟んで繋ぐ（`tts/core.py`）。

## 読み辞書

`tts/yomi.yaml`（`--yomi` か `MOTION_YOMI` で別の辞書に差し替えられる）を `tts/yomi.py` の規則で掛ける。`terms` は必ず仮名に置換（最長一致、より長い漢字語・英単語の一部なら置換せず警告、日本語を含まない発話には掛けない）、`watch` は文脈で読みが変わる語の報告だけ、`watch_kanji` は誤読の原因になった字を含む未登録語の警告。足すのは「誤読を実測し、仮名化で直ることを確かめた語」だけにする（正しく読める語を仮名にすると韻律が落ちる）。

## エンジンと言語

`--engine` > `voice.json` の `"engine"` > デッキの `<html lang>`（`ja` なら `irodori`、それ以外は `voxcpm2`）。どちらも同じ mlx-audio のサーバーで、モデル名だけが違う（`tts/core.py` の `ENGINES`）。日本語以外では読み辞書を使わない。

```json
{"lang": "en", "engine": "voxcpm2", "expert": "gendo"}
```

## キャッシュ

- **音声**：`seg_<digest>.wav` があれば合成しない。digest は `segDigest`（kit/narration.mjs）に、話者・TTS 用の文字列・声・モデル・音量の目標・行間・無音除去の設定・読み辞書と適用規則（実際に使った辞書と `tts/yomi.py`）のハッシュを入れたもの。どれかが変われば作り直す（辞書を直すと全段階が作り直しになる）。dry-run は別の digest なので本番の音声と混ざらない。`--force` で作り直し
- **動画**：段階ごとに「最終状態の画素・動きの途中の 1 コマの画素・音声ファイルの中身・dur・lead・anim・fps・scale」のハッシュを `<out>/.render-cache.json` に控え、同じなら作らない。画面を撮って比べるので、CSS・部品・テーマを直しても正しく作り直される（使う字が増えて字の埋め込みが変わると、見た目が同じでも作り直しになることがある）。`--force` で全部作り直し
- 段階が減ると、余った `clip_NNNN.*` は消す（canon の連番がずれないように）

## 長さの調整（timeline.json）

段階の長さは `DECK.timeline()` が決める（自動再生と書き出しで同じ）：`dur = override.dur ?? max(anim, 音声 ? lead + 音声 + pad_after : hold)`。既定は lead 0.25 s、pad_after 0.6 s、hold 1.2 s。例外だけを `<デッキ>/timeline.json` に書き、**build し直してから** render する。

```json
{"学習率と収束:concl": {"pad_after": 2.0}, "何を最小化するか:1": {"hold": 2.5}, "更新の式:0": {"dur": 6}}
```

- `pad_after` / `hold` / `lead` は音声との関係を保って伸ばす。`dur` は固定（音声が lead + dur を超えると末尾を切り、render が警告する）
- 動きの区間（anim）だけを fps で撮り、残りは最終状態の 1 枚を伸ばす。長さを変えても撮るコマは増えない
- 音声は lead 秒の無音のあとに置き、dur まで無音で埋める。クリップの長さは dur を 1/fps に丸めたもの
