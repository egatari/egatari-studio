---
name: m-qq
summary: Q-Q plot of logit residuals; synthetic (straight) morphs into a real learner (heavy tails) (deck-local)
steps: 2
props: cue, move, lag
---

Data: `data/qq.json` `{q, synthetic, learner}` (standardized sample quantiles, same length as q). The y range is
computed from the data (symmetric, half-unit headroom), x range from q.

- Step 1 (1.3 s): synthetic dots appear left to right in var(--term), label "synthetic: straight".
- Step 2 (≈3.35 s): lead-in 0–1.0 s, the label fades (subtle). Main motion from `cue` = 1.2 s: dots move to the
  learner quantiles (center first, tails up to `lag` = 0.35 s later, 1.4 s each), color mixes var(--term) → var(--emph);
  label "learner: heavy tails" at the end.

Narration sync: `cues(2) = [1.2]` (one time per `{cue}`, no leading 0). Note: in `learner:[2]` the `{cue}` is at the very start of the line, so the
lead-in is compressed to ~0 and the morph starts with the audio. Moving it after a few words
(e.g. "But a Q-Q plot reveals {cue}four departures…") gives the intended pause.
