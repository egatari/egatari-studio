### Added

- Components v1.10.0 is the default version: **`m-hissan`** (筆算: addition, subtraction, multiplication and division, decimals too, step by step like the textbook), **`m-numberline`** (数直線: points, □, jumps, inequality ranges, a 0.1 magnifier, two lines for proportions) and **`m-tape`** (テープ図・線分図 with braces and “2 倍” arrows), in the series `academic`. For now they are paid-only (`FREE_OUT`): a free pack never names them, and their purposes fall back to the nearest part or HTML there. Release notes: [egatari/components v1.10.0](https://github.com/egatari/components/releases/tag/v1.10.0)

### Changed

- Components v1.10.0, **visible in lessons**: m-timer's built-in label 「時間です」 now reads 「時間」, and the −1/+1 controls of m-predict and the −1 分/+1 分 controls of m-timer use 27 px text. The demos of m-boxplot, m-predict and m-timer now pass Studio's quality check (their known errors are removed from the component test); the new m-numberline demo has one (slide 3 overflows by 47 px), listed as known until it is fixed upstream. The lecture checks inside the parts read `ctx.preview || ctx.mode === "lecture"`; Studio still passes mode `lecture`, so nothing changes yet.
