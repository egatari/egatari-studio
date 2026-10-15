---
name: m-relcurve
summary: 信頼性図に、ロジットのノイズ τ のときの最適な補正 C(p) を描き、τ を動かす（温度スケーリングの曲線を重ねられる）
steps: taus の数
props: taus, sweep, overlay, dur, lead
---

データは `data/relcurve.json`（`scripts/make_data.py`）：`{p, taus, exact, ts, T}`。行の間の τ は線形に補間する。

- 段階 1：`taus[0]` の C(p) を赤い実線で引く。`overlay` なら温度スケーリング σ(logit p / T) を紺の破線で続けて引く
- 段階 j ≥ 2：`lead` 秒待ってから、τ を `taus[j-2]` → `taus[j-1]` へ `dur` 秒で動かす。前の τ の曲線は薄い灰色で残す
- `cues(j ≥ 2) = [lead]`：口述原稿の `{cue}` 1 つで、τ が動き始める時刻を音声に合わせる
- `sweep` か `overlay` のとき右下に τ（と overlay なら T）の読み値を出す。曲線の名前は右端の高さに直接書く

注意：信頼性図は正方形にし、残りの幅を右の名前の欄に使う。図の高さが小さいと図も小さくなる。
