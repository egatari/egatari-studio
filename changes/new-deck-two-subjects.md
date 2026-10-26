### Changed

- New…, free plan: up to two subjects can be ticked (`FREE_SUBJECT_MAX`, `freeSubjects` in `kit/core/new-deck.mjs`). With two ticked the other boxes are disabled and the list says “Up to two on the free plan.” (無料のプランでは 2 つまで選べます); unticking one enables them again. The guess from steps 1 and 2 ticks two at most (the first two in subject order). The paid plan has no limit.
- New… always starts with no subject ticked; it does not read the open lesson's `studio.newDeck`. A record written elsewhere with more than two subjects is kept as it is, and the free plan's pack uses its first two (`seriesForChoice`).
- Size caps for the free plan: `PACK_CAP_KB.free` is now `{ one: 40, two: 50 }` (every single subject ≤ 40 KB, every pair ≤ 50 KB, in ja and en); the cap for every subject (59 KB) is gone. `npm run gen` prints each single subject and the largest pair, and the size table in `docs/authoring-with-llms*.md` lists the largest pair instead of every subject.
