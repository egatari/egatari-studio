### Removed

- Egatari Player 1.4.0: the `learn` mode (Player P1, spec 60eda15). A `?mode=learn`, a `learn` in `deck-meta.offer`, in
  `<html data-mode>` or in an embedding `{egatari:"mode"}` command is read as `talk`; parts get `ctx.mode` `talk` or `video` only

### Changed

- Egatari Player 1.4.0 (the bundled player that files carry, `player` in the index and `deck-meta`): minor release. Self-study is
  the slide show with playback, for a file opened directly or in an LMS: the toolbar starts with previous, **Play** / **Pause**,
  next and **Playback speed** (0.75–2×, pitch kept; `<` / `>`), and keeps the presenter tools. Pausing resumes from the same point;
  while playing, the toolbar's previous / next, digits + Enter and the overview keep playing, while the presenter's step keys pause
- Egatari Player 1.4.0: `deck-meta.offer` (format §1.2, Player P1) is applied. The lesson opens in `offer.open` {mode, face}
  (order: `?mode` / `?layout` / embedding, the viewer's remembered layout, `offer.open`, `metadata.primary`, `<html data-mode>`,
  defaults), and faces not in `offer.faces` are left out of View, `r` and Read in the book. Embedding answers `{egatari:"mode"}`
