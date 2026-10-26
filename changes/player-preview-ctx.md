### Added

- Player: under **Show later steps faintly**, an element marked `data-preview="none"` keeps its later steps hidden instead of faint (an answer the audience should work out first), and so does a component that declares `static preview = "none"` (m-predict, m-hissan and m-timer from the components release that adds it); the player no longer dims such a component from outside (format spec §8.4, Player P1)
- Player: `?mode=talk&preview=1` opens a slide show with later steps shown faintly (Player P8); `?mode=lecture` keeps working as before
- Player: the key list (<kbd>?</kbd>) of an Egatari file shows its versions in the order Format → Player → Made with (「形式」「プレーヤー」「作成」, e.g. Format: Egatari 1.0 · Made with: Egatari Studio 0.6.0), using `title` from `player` and `generator` when present and `name` otherwise; the Player line appears when the file names its player (format spec §4.1, Player P3)

### Changed (API)

- Component context (format spec §8.4): `ctx.mode` is `"talk"` or `"video"`, never `"lecture"`; later steps shown faintly are `ctx.preview === true` (with `mode: "talk"`). Components pinned before v1.10.0 that test only `ctx.mode === "lecture"` draw their later steps hidden under preview. `ctx` passes `preview: false` to a component inside an element marked `data-preview="none"`
- Component context (format spec §8.4): `ctx.slide` is the slide's key (a string), no longer the slide's element; a component that needs its slide finds it in the document. No component in the library reads it

### Changed

- Later steps shown faintly are drawn at the theme's `--preview-opacity`, 0.45 (was `--lecture-dim`, 0.5), so they are slightly fainter. `kit/base.css` and theme `default` define `--preview-opacity: .45`; `--lecture-dim` stays defined, equal to it, for components pinned before v1.10.0
