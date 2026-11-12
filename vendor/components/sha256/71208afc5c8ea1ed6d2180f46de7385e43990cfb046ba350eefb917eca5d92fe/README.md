---
name: m-ci
display: 信頼区間の意味 / Confidence intervals
version: 2.0.1
series: academic
tier: specialized
set: data
summary: 正規標本の区間を重ね、母平均を含む割合で信頼水準を説明する
steps: 軸と μ→区間を順に→含む数と外れの強調（3 ステップ）
purposes: model, spread
props: dur, fast, size
---

`<m-ci style="height:440px">` の子に JSON を置く。

- `mu`, `sigma`, `n`：母平均、正の母標準偏差、正の整数の標本数
- `reps`：正の整数の区間数（40）。`level`：0〜1 の間（0.95）。`seed`：整数（2）

<!-- llm: omit -->
```html
<m-ci style="height:440px"><script type="application/json">{"mu":50,"sigma":10,"n":25,"reps":40,"level":0.95,"seed":2}</script></m-ci>
```

既知の σ による z 区間。0.90・0.95・0.99 は z = 1.645・1.96・2.576、それ以外は Acklam の逆正規近似。Mulberry32 と Box–Muller で各標本を作り、平均 ± zσ/√n を計算する。95 % は反復した区間の約 95 % が固定の μ を含む意味。有限回の結果は水準と必ずしも一致しない。

最初の 3 区間を各 dur 秒、残りを fast 秒で出す（3 以下なら各 dur 秒のみ）。最後に実測の個数と割合（小数 1 桁まで）を示し、外れは太い emph、含む区間は term。太さでも区別する。

属性：dur は 1 秒、fast は 2.5 秒、size は 0 なら 26px（指定は 24 以上）。不正属性は報告して既定へ。n・reps は安全な正の整数。不正データや表現不能な数値範囲は報告して描かない。不正 seed は報告して 2。

注意：1184×440px、40 区間が目安。行間 6px 未満や文字が収まらないと size を報告。目盛りは 1・2・5 系。

表示文は ctx.lang の日英に従う。role="img" と最終状態の aria-label を付け、作者のラベルを保ち、SVG は読み上げ対象外。先の計算結果はプレビューで見せない。英語も文字の箱 1.43em と余白を確保する。見本は架空データ・シミュレーション。
<!-- llm: end -->
