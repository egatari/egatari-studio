### Changed

- Components 2.0: Studio now vendors the released egatari/components **v2.0.0** (tag commit dd4d4f0) and uses it as the default 2.x catalogue. m-timer, m-predict, m-flow, m-quad and m-cycle are 2.0.1 (viewer input: `ctx.extend`, `input(i, n)`); every other part keeps its 2.0.0-rc.1 code. The rc.1 catalogue stays in `components2.lock.json` so lessons that pin it still build.
