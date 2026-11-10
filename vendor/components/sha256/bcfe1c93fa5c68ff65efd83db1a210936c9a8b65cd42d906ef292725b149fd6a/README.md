---
name: m-folds
display: 交差検証 / Cross-validation
version: 2.0.0
series: academic
tier: specialized
set: data
summary: 検証用の区画を順に替え、各分割の誤差と平均を示す
steps: 分割を 1 行ずつ→平均（k + 1 段階）
purposes: model, compare
props: dur, size
---

`<m-folds style="height:440px">` の子に JSON を置く。

- `k`：分割数 2〜10 の整数
- `errors`：省略可。k 個の非負誤差
- `labels`：省略可。k 個の区画名（既定 1〜k）

<!-- llm: omit -->
```html
<m-folds style="height:440px"><script type="application/json">{"k":5,"errors":[0.21,0.18,0.25,0.19,0.22],"labels":["1","2","3","4","5"]}</script></m-folds>
```

等幅の区画を入力順に並べる。行 i の区画 i が検証（emph 淡色と実線枠）、残りは学習（term 淡色）。幅 40px 以上の区画には学・検（英語 T・V）。枠と凡例でも区別する。名前は上に 1 回だけ。最後は誤差列の下に罫線と算術平均。誤差と平均は小数 2 桁。errors 省略時も k + 1 段階で最後は完成した分割図を保つ。

errors・labels の長さが k と違う、誤差が負、k が範囲外なら data を報告して描かない。dur は各段階 1 秒。size は 0 なら 26px、指定は 24 以上。不正属性は報告し既定へ。

注意：1184×440px は 5 分割の目安。10 分割は高さ 700px 程度。行・凡例・区画名が収まらなければ size を報告する。

表示文は ctx.lang の日英に従う。role="img" と最終状態の aria-label を付け、作者のラベルを保ち、SVG は読み上げ対象外。先の計算結果はプレビューで見せない。英語も文字の箱 1.43em と余白を確保する。見本は架空データ・シミュレーション。
<!-- llm: end -->
