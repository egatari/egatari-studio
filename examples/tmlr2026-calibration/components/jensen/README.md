---
name: m-jensen
summary: シグモイドを事後分布で平均すると 0.5 の側へ縮む（σ(E[θ]) > E[σ(θ)]）ことを見せる
steps: 1
props: split, peak
---

データは `data/jensen.json`（`scripts/make_data.py`）：`{theta, sigmoid, mu, sd, pdf, sig_of_mean, mean_of_sig}`。

- 段階 0：シグモイドを薄く出す
- 段階 1 の前半（0〜`split` 秒）：事後分布の山が μ のまわりに立ち上がる
- 後半（`split`〜2·`split` 秒）：σ(E[θ]) と E[σ(θ)] の点と縦軸への補助線、上から下への矢印と「toward 0.5」

`cues(1) = [split]`：口述原稿の段階の中の `{cue}` 1 つで、後半の始まりを音声に合わせる
（kit の伸縮は `{cue}` の数と `cues(k)` の長さが等しいときだけ働く。`[0, split]` にすると合わない）。
