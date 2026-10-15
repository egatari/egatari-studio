---
name: m-bars
summary: Grouped bars (raw vs TS); the last group arrives with a smooth y-axis rescale (deck-local)
steps: 3 (first groups / outlier climbs on the same scale / slow pull-back)
props: cue, scale, y1, y2
---

Data: `data/bars.json` `{metric, groups:[{label, raw, ts}]}` (paper Table 4; the last group is the outlier).
y1 / y2 default to a "nice" max of the first groups (0.016) and of all groups ×1.12 (0.20, room for the "0.168" label).

- Step 1 (1.5 s): first groups grow from 0 (raw var(--muted), TS var(--term)); "raw" / "TS" labels above group 1.
- Step 2 (3.5 s): lead-in 0–1.0 s, groups slide left to make room and the last raw bar grows (subtle, on
  "when the classifier is underconfident"). Main motion from `cue` = 1.2 s for `scale` = 1.6 s: y max is
  interpolated in log space Y1 → Y2; the last TS bar (var(--emph)) is tied to the scale so it "pushes" the axis up;
  value label at the end.
- Ticks: candidate step sets (0.001 … 0.5); each set's weight comes from its pixel spacing (fades 38–60 px), a finer
  visible set hides coarser ones, so labels cross-fade deterministically; decimals follow the dominant set
  (0.005 / 0.010 / 0.015 → 0.05 / 0.10 / …).

Narration sync: `cues(2) = [1.2]` (one time per `{cue}`, no leading 0); the `{cue}` in `breaks:[2]` ("…cannot help, {cue}and the calibration error
grows about tenfold") lands the rescale on "grows".
