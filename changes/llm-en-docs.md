### Changed

- Components 2.0 lessons use egatari/components **v2.4.3** by default: the 16 standard parts (bars, curves, cards, flow, compare, fishbone, menu, pie, cycle, predict, scatter, venn, tree, quad, kpi, timeline) gain English docs (`README.en.md`); no part's code or version changes
- English AI instructions now describe those 16 parts from their English docs (summary, steps, prop meanings, example data, notes) instead of the Japanese README; each part's English text is checked to be no longer than its Japanese one, and the English example data must have the same shape as the part's own example.
  English packs get smaller in bytes (free standard 35.4 → 29.5 KB, paid standard 71.0 → 47.7 KB, paid every set 131.0 → 106.9 KB)
- On the free plan, some English single-set instructions now leave out one more standard part to fit the paste length: math also leaves out `m-pie`, maps `m-fishbone`, kokugo `m-cycle`, science `m-tree` (stats is unchanged).
  The Japanese instructions are unchanged apart from their version line and the parts' docs link (v2.4.3)
