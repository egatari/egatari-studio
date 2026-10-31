### Changed (API)

- Player components receive `ctx.extend(seconds)` for per-step viewer timing. `DECK.stepExtension(i, k)` exposes accumulated timing extensions for the future sound hook.
- `ctx.live` exists with a live client but ships dormant in v0.6.3: no live source feeds it yet. `poll(id)` returns null until the live service sends reveals (backlog #112, outside the pre-GA plan), so parts keep their viewer/author counts. The live client's `setPollResult(id, {revealed, counts})` is a future integration point requiring an explicit reveal and at least three answers.

### Added

- Live step extensions persist across steps on the same slide, reset on slide entry or jumps, and adjust animation clocks and autoplay without changing authored durations, timelines, video or print.
