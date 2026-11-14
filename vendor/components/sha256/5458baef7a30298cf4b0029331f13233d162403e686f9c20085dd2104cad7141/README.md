---
name: m-balance
display: 期待値はつり合いの位置 / Expectation as a balance point
version: 2.0.1
series: academic
tier: specialized
set: data
summary: 確率の重りを置き、支点が期待値でつり合う様子を示す
steps: 数直線と重り→支点を期待値へ→値と和の式（3 ステップ）
purposes: model
props: dur, digits, size
---

`<m-balance style="height:440px">` の子に JSON を置く。

- `values`：異なる数 2〜12 個
- `probs`：同数の確率。合計 1（±1e-9）、外れは報告して描く
- `name`：変数名（X）

<!-- llm: omit -->
```html
<m-balance style="height:440px"><script type="application/json">{"values":[0,1,2,3],"probs":[0.1,0.3,0.4,0.2],"name":"X"}</script></m-balance>
```

棒の高さは確率に比例。支点は最小値から E[X] へ動き、モーメントに比例する傾き（±8° 以内）が 0 になる。棒・数直線・目盛りも梁と傾く。ステップ 1 は水平、ステップ 2 の開始で重い側へ傾けてから水平へ。最後は支点付近の E[X] と積の和。式は mtext、6 項を超えると最初の 6 項の後を … にする。計算と読み上げの重りは全項を含む。負の値は式中で括弧を付ける。

不正な確率合計は正規化しない。式は与えた積の和。確率が 0〜1 の範囲外、長さの不一致、値の重複、表現不能な計算は data を報告して描かない。

dur は各ステップ 1.5 秒、digits は期待値の小数桁 0〜10（2、末尾の 0 は省略）、size は 0 なら 26px、指定は 24 以上。不正属性は報告し既定へ。

注意：1184×440px が目安。数値を正規化して座標計算し、目盛りは 1・2・5 系。近い値の棒・確率や長い式が収まらなければ size を報告する。

表示文は ctx.lang の日英に従う。role="img" と最終状態の aria-label を付け、作者のラベルを保ち、SVG は読み上げ対象外。先の計算結果はプレビューで見せない。英語も文字の箱 1.43em と余白を確保する。サンプルは架空データ・シミュレーション。
<!-- llm: end -->
