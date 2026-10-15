---
name: m-seq
summary: 観測を 1 つずつ加え、分布と数値が更新されていく様子を見せる（前の分布は薄く残す）
steps: ceil((steps の数 − 1) / per-step)
props: per-step, slot, xr, yr, xt, yt, xf, yf, xl, yl, digits, panel, ghosts
---

回答や観測を 1 個ずつ加えて、事後分布と推定値が絞られていく過程を見せるときに使う
（motion-slides スキル §6「逐次更新」）。

子の JSON：`{"xs": [...], "steps": [{"dens": [...], "readout": {"名前": 値}, "mark": x}, ...], "digits": {"名前": 桁}, "markLabel": "*y*_n"}`。
`xl` `yl` `yr` などの軸の設定は JSON にも書ける（属性があれば属性を優先）。

- `steps[0]` が始めの状態（段階 0）、`steps[1..]` が 1 回ずつの更新
- `per-step` 回の更新を 1 段階の中で順に動かす。1 回の長さは `slot` 秒、`cues(k)` は各更新の開始時刻を返すので、
  口述原稿の `{cue}` を更新の数だけ置けば、音声に合わせて 1 回ずつ動く
- 数値は前後の値の間を補間し、`digits` の桁でそろえて表示する（等幅の数字）

見本は `demo.html`（分散既知の正規モデルで平均の事後分布を更新）。
