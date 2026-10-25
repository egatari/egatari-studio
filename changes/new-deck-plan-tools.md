### Changed

- New… step 4: **the plan no longer means “every part”; it changes how much goes in.** Subjects are chosen on both plans and pre-ticked from step 2 on both (never all ticked by default; the paid “all of them are included” state is gone). Chat AI: free plan sends the standard parts (`FREE_CORE`) and up to two subjects as before; Chat AI: paid plan sends every standard part and the chosen subjects with no limit. Switching back to the free plan keeps the first two ticks. The strip 「この指示に入るパーツ」 and the answered line follow the chosen subjects and tools on both plans. Instructions pack `fb9e430d` → `48ab84a3`.

### Added

- New… step 4: a **道具 / Tools** row, 「スライドで使う道具はありますか（道具）」 / “Will the slides use any of these? (tools)”, built from the components' manifest (`components.<name>.group: "tool"` and its `tile`; today タイマー / Timer). A tool part goes into the instructions only when its tile is on, on either plan; the timer is pre-ticked when the title, content or other wishes mention グループワーク, a number of minutes (「10 分」) or 時間, never over your own choice. The chosen tools are stored in `studio.newDeck.tools`. `node kit/llm-pack.mjs` takes `--tools`, and `--plan paid` now honours `--series` (`--series all --tools all --plan paid` is the full pack). `npm run gen` checks every paid pair of subjects with every tool against 120 KB and only warns for the all-ticked worst case.

### Changed (API)

- `assemble(data, {series, tools, lang, exclude, off, plan})` (`kit/core/llm-pack-assemble.mjs`), `buildPack`, `packWithRequest`, `commonBody(…, plan, tools)`, `seriesPart(…, plan, tools)` and `loadedParts(series, plan, tools)` take an optional `tools` list (tags or names, or `'all'`); without it no tool is included. With `plan: 'paid'`, `series` is now honoured (it used to be every series): pass `series: 'all', tools: 'all'` for the full pack. `kit/core/llm-pack.mjs` exports `TOOLS`; `kit/core/new-deck.mjs` exports `guessTools` and `toolsForChoice`, and `studio.newDeck` has `tools`.
