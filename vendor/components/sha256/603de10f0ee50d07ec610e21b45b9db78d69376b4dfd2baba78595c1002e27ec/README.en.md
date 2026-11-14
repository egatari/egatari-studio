---
summary: Grid of slide-link cards (contents); plain <a href="#<slide id>">; visited mark
steps: ceil(cards / per-step) (per-step="0": 0)
props:
  cols: columns (0 = auto)
  per-step: cards per step (0 = all, no steps)
  size: title px
  fade: appear (s)
  stagger: card offset (s)
  visited: mark visited cards
example: "<a href=\"#s-abc123\" data-sub=\"Subtitle\">Title</a>"
---

Contents; choosing where to start.
<!-- llm: omit -->
Cards are plain child links; the part only styles them (grid, circle, subtitle, mark). Clicks are handled by the runtime (`kit/deck.js`)
([format spec §9.1A](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#91a-links-to-slides), `docs/contract.md` §9).

<!-- llm: end -->
```html
<m-menu cols="3" aria-label="Today">
  <a href="#s-njd4kp" data-icon="1" data-sub="Poet">Poem A</a>
  <a href="#s-uhqygr:2" data-icon="2" data-sub="Order">Poem B</a>
  <a href="lesson2.ega.html" data-sub="Next">Drill</a>
</m-menu>
```

- One child `<a href>` = one card. `href`: `#<slide id>` (step 0) or `#<id>:<step>` (`0`, `1`, … `concl`); ids from `npm run ids`; content = title
- `data-icon`: circle text (`1`, `A`). `data-sub`: subtitle
<!-- llm: omit -->
- Links to other files (`other.ega.html#s-…`): plain links, "other file" mark bottom right; not bundled into the single .ega.html
- Click: presenting = that step's final state; autoplay continues from there. "Back" top left (Backspace, Alt+←, browser back)
- Visited mark: ✓ top right once the target slide was opened this session (not saved; not in video or print).
  Viewer-side state outside (i, k, t) (like `m-kobun` cards). `visited="false"` disables
<!-- llm: end -->
- `per-step="n"`: n cards per step (from `data-from`); unshown cards inert. `0` = all at once
- `cols` default: ≤ 3 cards 1 row, 4 → 2, more → 3. Min height `--mm-h` (104px), gap `--mm-gap` (18px). Fill, centred: `style="height:100%;align-content:center;--mm-h:150px"`
<!-- llm: omit -->
- Text: title `size` (34px), subtitle 0.8× (≥ 27px body minimum). Circle `--term`, subtitle `--muted`. `stagger` within a step; depends on (k, t) only
<!-- llm: end -->

The demo is `demo.html`; also slide 2 of `examples/kokugo-kanbun`.

<!-- llm: omit -->
Notes

- Without scripts (readable layer, pre-print HTML) it reads as a plain list of links
- The part wraps title, subtitle, circle in `span`s but leaves `<a>` and `href` as written
- No CSS transitions (real time would break (k, t))
<!-- llm: end -->
