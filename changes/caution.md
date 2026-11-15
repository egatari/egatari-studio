### Added

- Caution and warning boxes in a slide's body: `<div class="caution">…</div>` (注意 / Caution: a thick bar at the start and a circled i) and `<div class="caution warn">…</div>` (警告 / Warning: a full frame and a triangle with !). The build adds the label as the first child (`<span class="caution-label">`, Japanese or English by the lesson's language) and `role="note"`; the icon is decoration. On a vertical slide the bar is on top. Colours come from the new theme tokens `--caution` (amber) and `--warn` (red-orange)
- Quality check (command line and editor, `kit/core/caution.mjs`): `cautionEmpty` (error: no text besides the label) and `cautionLabel` (warning: the author wrote the label too). The AI instructions say how to write the box in one line
- Every bundled theme adds the two tokens: default 1.6.0, bengara 1.1.0, the others 1.4.0. Earlier theme versions are kept
