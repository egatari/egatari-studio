### Changed (API)

- Player components receive `ctx.extend(seconds)` for per-step viewer timing and `ctx.live.poll(id)` for revealed poll counts. `DECK.stepExtension(i, k)` exposes live totals for the future sound hook.
- The live client adds `poll(id)` and `setPollResult(id, {revealed, counts})`; the bridge requires an explicit reveal and at least three answers. The current v1 service has no learner reveal message yet.

### Added

- Live step extensions persist across steps on the same slide, reset on slide entry or jumps, and adjust animation clocks and autoplay without changing authored durations, timelines, video or print.
