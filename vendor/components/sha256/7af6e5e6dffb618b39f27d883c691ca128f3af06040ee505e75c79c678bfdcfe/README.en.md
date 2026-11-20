---
summary: A tall figure (SVG, HTML) in a fixed-height frame, scrolled to set places by step; viewers may scroll it
steps: largest child data-scroll-step
props:
  dur: scroll seconds
  margin: px above target
---

For a tall timeline, flow or code shown without splitting it.

Child of `<m-scroll style="height:440px" aria-label="name">`: the figure.

- `data-scroll-step="k"` on a child: step k scrolls it to the top
- Wheel, touch, ↑ ↓, PageUp/Down scroll the frame; ← → and Space move slides
- A hand-scrolled place stays until the next step
<!-- llm: omit -->
- `--line` border; outside is cut on purpose (`data-clip`). Video and print show the author's place.
<!-- llm: end -->
