---
name: m-points
summary: Binned reliability points before / after temperature scaling, over the theoretical curve (deck-local)
steps: 2
props: cue, move
---

Data: `data/points.json` `{tau, T, bins:[{x_raw,y_raw,x_cor,y_cor,n}], theory:{p,C}}` from `scripts/make_data.py`.

- Step 1 (1.7 s): theory curve draws (var(--term)), raw bin points pop in (var(--emph), radius ∝ √n), label "before".
- Step 2 (≈3.0 s): lead-in 0–1.0 s, the curve fades to var(--muted) (subtle). Main motion from `cue` = 1.2 s:
  points slide from (x_raw, y_raw) to (x_cor, y_cor) over 1.4 s with 25 ms stagger; label swaps to "after, T = …".

Narration sync: `cues(2) = [1.2]` (one time per `{cue}`, no leading 0). The `{cue}` in `synthetic:[2]` maps 1.2 s to the spoken cue,
so the points start moving on "they fall onto the diagonal". Bins with n = 0 are skipped.
