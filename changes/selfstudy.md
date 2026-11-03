### Added

- Self-study (`?mode=learn`, Player P1): the toolbar has Play / Pause, previous, next and Playback speed (0.75, 1, 1.25, 1.5, 2×; `<` / `>`),
  with the narration's pitch kept and the timeline at the same speed; pause resumes from the same point and stepping while playing keeps
  playing; no laser pointer, pens or presenter view. With `?embed=1`, `play`, `pause` and `rate` commands and the `state` event (Player P8)
- Progress tracking (`kit/track.js`, Player P6, format spec §9.2): a SCORM 1.2 API, the parent of an `?embed=1` frame (`postMessage`) or
  this device, the first found. Steps played on the slides (`via: "stage"`) and read in the book or script for 3 seconds (`via: "text"`)
  are kept apart; a step the slides only reached by following the book is not played. Completion follows `metadata.completion`
  including `played: true`. SCORM suspend data carries the `stage` and `text` sets beside `seen` (binding §2.2). With a SCORM API or an
  embedding host, its location wins over the device's "Resumed where you left off". Egatari files list `scorm12`, `postmessage` and
  `local` in `deck-meta.tracking`

### Changed

- Every build, also the working folder's `out/deck.html`, writes `deck-meta.completion` from `metadata.completion`
- Playback pauses when the page is hidden (Player P3)
- `metadata.completion` may combine `visitedFraction` or `reachedEnd` with `played: true` (it was refused as more than one rule)
