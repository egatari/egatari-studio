# m-contrast changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.19.0)

- New: a contrast figure for positioning a study, when the novelty is an answer or a view (handoff #71). `kind: "answers"` (default) sets each question's earlier answer (or a dashed "unknown" with what is known nearby) against this work's answer and its basis, framed; steps go questions → earlier answers → this work (`order="row"`: a row per step). `kind: "assumptions"` sets near studies' assumptions, as chips with what each yields, against this work's row: kept, dropped (written and struck through), added (written, in `--emph`) and what it newly yields. `selfLabel` and `heads` rename this work and the column heads. The readable table gives the final state.
