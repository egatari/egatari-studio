### Fixed

- State the viewer changes by hand in a component (an open `m-kobun` conjugation card) no longer carries across steps: entering any step,
  also the same one again (`DECK.go`, `DECK.seek`, a slide change and back), redraws a touched component as `render(k, t)` (format spec §8.4)

### Added

- Components get `ctx.reset === true` in `render` on the first step entry after the viewer touched them (docs/contract.md §3)
