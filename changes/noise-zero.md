### Changed (API)

- `node kit/check.mjs --json`: the info `compOrderNoise` is no longer a finding. Step comparisons accepted as anti-aliasing noise are listed in a new top-level `renderNoise` array (`{slide, id, step, data, msg}`) and are not counted in `counts`, `rules` or `summary`. Whether such noise appears changes from run to run, so the same lesson gave different info counts (parts-showcase: 89–95). Comparisons with 0 differing pixels (only the PNG bytes differed) are not listed at all. The error `compOrder` is unchanged (backlog #210)
