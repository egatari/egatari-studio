---
summary: Icon cards in a row or 2 rows, by step; arrows for order
steps: largest card step (default 1 card = 1 step)
props:
  layout: row, or grid (2×2; 3×2 for 5–6)
  arrows: order arrows (grid: Z order)
  nums: number circles
  hilite: last or a number (from 1)
  per-step: cards per step (0 = all)
  stagger: card offset (s)
  dur: appear seconds
example: {"cards": [{"icon": "user", "title": "Listen", "text": "Hear the problem"}, {"icon": "bulb", "title": "Think", "text": "Find 3 ideas"}, {"icon": "rocket", "title": "Try", "text": "Build small, show"}]}
---

Steps, 3–4 key points, or a 2×2 of cases, as icon cards.

Child JSON: `{"cards": [{"n", "icon", "title", "text", "step", "tone"}, …]}` (2–6 cards).

- `title`: required, ≤ 2 lines. `text`: wraps; cut with … and reported if too long
- `icon`: Tabler outline name (list below); unknown = dashed box, reported
- `n`: circle text (`"A"`, `"1"`); `nums` numbers the rest 1, 2, 3 …
- `tone`: circle and icon colour (`term`, `emph`, `accent2`, `series-1..4`)
- `layout="grid"`: wide cards put number, icon, title on one line
- `arrows`; `hilite="last"` or `"3"`: `--emph` frame and fill
- `variant`: `rise` (default), `fade`, `draw`

Icons:

- People: user users user-check user-plus user-circle friends mood-smile man woman id-badge
- Data: chart-bar chart-line chart-pie chart-dots trending-up trending-down table database filter adjustments percentage sum
- Money: coin cash credit-card wallet receipt pig-money building-bank report-money shopping-cart tag
- Time: clock calendar calendar-event calendar-time hourglass history alarm stopwatch
- Place: map-pin map world home building building-factory building-store route truck
- Flow: arrow-right arrows-right-left refresh repeat circle-check checklist list-numbers git-branch target flag rocket hand-click
- Talk: message messages mail phone bell speakerphone share world-www microphone presentation
- Docs: file file-text files notebook book clipboard-list folder news certificate award
- Tools: tool settings hammer bulb puzzle cpu device-laptop device-mobile robot code scale
- Nature: leaf tree plant sun moon cloud cloud-rain droplet flame snowflake
- Safety: shield shield-check lock key alert-triangle first-aid-kit heart heart-rate-monitor eye
- Learning: school pencil ruler math-function atom flask microscope palette music language

The demo is `demo.html`. Companies and numbers are fictional.

<!-- llm: omit -->
Notes for authors of parts

- Icons come by name from the library part `icons` (Tabler outline, MIT); a build keeps only the names a lesson uses. Colour: `currentColor`
- Sizes: icon 32–64 px, title 26–34 px, text 24 px
- Overflow is cut with … and reported once (`layout`)
- Screen readers: svg `role="list"`, cards `role="listitem"` with number, title and text; icons and arrows `aria-hidden`
- Lecture view: later cards at `--preview-opacity`; print and video show the last step
<!-- llm: end -->
