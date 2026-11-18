---
name: m-folds
display: 交差検証 / Cross-validation
version: 2.1.1
series: academic
tier: specialized
set: data
summary: データを k 個に分けた 1 つ（フォールド）を検証に使い、検証に使うフォールドを順に替えて、各分割の誤差と平均を示す
steps: 分割を 1 行ずつ→平均（k + 1 ステップ）
purposes: model, compare
props: dur, size
---

`<m-folds style="height:440px">` の子に JSON を置く。

- `k`：分割数 2〜10 の整数。既定文字で k = 5 は高さ 316px 以上（誤差なし 264px）
- `errors`：省略可。k 個の非負誤差
- `labels`：省略可。k 個のフォールド名（既定 1〜k）

<!-- llm: omit -->
```html
<m-folds style="height:440px"><script type="application/json">{"k":5,"errors":[0.21,0.18,0.25,0.19,0.22],"labels":["1","2","3","4","5"]}</script></m-folds>
```

等幅のフォールドを入力順に並べる。行 i のフォールド i が検証（emph 淡色と実線枠）、残りは学習（term 淡色）。幅 40px 以上で十分な高さのフォールドには学・検（英語 T・V）。行が低ければこの字を先に省き、凡例と検証の枠は残す。枠と凡例でも区別する。名前は上に 1 回だけ。最後は誤差列の下に罫線と算術平均。誤差と平均は小数 2 桁。errors 省略時も k + 1 ステップで最後は完成した分割図を保つ。

errors・labels の長さが k と違う、誤差が負、k が範囲外なら data を報告して描かない。dur は各ステップ 1 秒。size は 0 なら 26px、指定は 24 以上。不正属性は報告し既定へ。

注意：1184px 幅が目安。行を既定の約 46px から 32px まで縮めてから高さを報告する。既定文字 26px ではヘッダー 99.4px、誤差ありのフッター 56.1px、誤差なし 4px。最小高は **ceil(99.4 + 32k + 56.1) = 156 + 32k px**（誤差あり）、**104 + 32k px**（誤差なし）。k = 5 は 316px／264px、k = 10 は 476px／424px。小さい行の行番号と誤差は等幅で表示する。

一般に f = 指定文字 px（既定 26）、L = 1.45f + 4、最小行高 R = max(32, ceil(1.2f))。最小高は ceil(2L + 16 + kR + フッター + 4)、フッターは誤差ありなら L + 0.4f、なければ 0。高さ不足は k・必要高・現在高・内訳、幅不足は凡例の必要幅と現在幅、フォールド名の番号・必要幅と使える幅を数値付き size で報告する。

表示文は ctx.lang の日英に従う。role="img" と最終状態の aria-label を付け、作者のラベルを保ち、SVG は読み上げ対象外。先の計算結果はプレビューで見せない。英語も文字の箱 1.43em と余白を確保する。サンプルは架空データ・シミュレーション。
<!-- llm: end -->

<!-- llm: omit -->
標本ごとの分割（2.1.0）：`splits`（分割ごとの `test` と `train` の番号）と `samples`（標本ごとの `class`・`group`・`t`）を書くと、列が標本、行が分割になる。値は `uv run tools/sk2ega.py model_selection data.csv --fit "StratifiedKFold(n_splits=4, shuffle=True, random_state=0)" --label class` の出力。

- `splitter`：`KFold`（`shuffle=True` で順を混ぜる）、`StratifiedKFold`（クラスの比率を保つ KFold）、`GroupKFold`（同じグループを分けない）、`TimeSeriesSplit`（過去で訓練し、その後で検証）、`ShuffleSplit`、`holdout`（1 回だけ分ける）
- 検証の標本は `--emph` の枠と淡色、訓練は `--term` の淡色、どちらにも使わない標本は破線の枠
- `classes`（4 個まで）：上の行にクラスの色と名前。色は `--series-1`・`--series-3`・`--fg`・`--series-4` の順（m-classify2d と同じ並び。`--emph` に近い `--series-2` は使わない）。`group`：同じグループの続きを枠で囲む。`t`：両端に最初と最後の時刻
- 確かめること：KFold の仲間は、どの標本もちょうど 1 回だけ検証に入るか。GroupKFold は同じグループが訓練と検証に分かれていないか。TimeSeriesSplit は訓練が検証より前か。StratifiedKFold は各クラスの検証の数が「全体 ÷ 分割数」から 1 未満のずれか。holdout は分割が 1 つか
- `errors` は分割ごとに 1 つ
- 標本は 60 個まで、分割は 10 個まで
<!-- llm: end -->
