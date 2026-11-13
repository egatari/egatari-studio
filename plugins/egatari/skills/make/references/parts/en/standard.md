<!-- generated; do not edit by hand -->
# standard parts

Instruction version: 47feb952

| part | what it shows | steps | data shape |
|---|---|---|---|
| `<m-bars>` | Bars grow from 0 by step (vertical, horizontal, grouped, stacked); the axis max can widen by step | max group/scale step (default 1 group = 1 step) | `{groups:[{label?,value?:num,values?:num[],step?,at?,tone?} (value or values),…],series?:{label?,tone?}[],scale?:{step,max?:num,at?}[],max?:num}` |
| `<m-cards>` | Icon cards in a row or 2 rows, by step; arrows for order | largest card step (default 1 card = 1 step) | `{cards:{n?:str,icon?:str,title:str,text?:str,step?,tone?}[]}` |
| `<m-compare>` | Table comparing 2–3 things: one column, the other, then row differences | columns + 1 (diff step; none if no diff/better) | `{sides:{label,tone?,step?}[],rows:{label?,values:(str\|num)[],diff?:str,better?:int}[]}` |
| `<m-curves>` | Lines drawn one at a time on shared axes, each named at its end (no legend) | largest step (default: number of series) | `[{label?,f?:str,pts?:[num,num][],tone?,step?,labelAt?:num,color?:str,dash?:bool,xr?:[num,num],area?:any[],areaLabel?:str\|any[],at?,anchor?:"right"\|"left"\|"above"\|"below"\|"top"\|"bottom"\|"start"\|"middle"\|"end",dx?:num,dy?:num,ly?:num} (f or pts),…]` — the data is the array itself, not {"series": […]}; axes go in attributes (xr="[0,10]" xl="…"); the expression field is f in x (not fn, not u) |
| `<m-cycle>` | Cycle diagram: stage boxes on a circle clockwise from 12, joined by arc arrows (last back to first too) | number of stages (default 1 per step; per-step n each; `node` step wins) | `{nodes:{id?:str\|int,label?,tex?,note?,tone?,step?,at?}[],center?:{label?,tex?,note?,tone?,step?,at?},edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[]}` |
| `<m-fishbone>` | Fishbone (cause-and-effect) diagram, one main bone at a time, head last; auto layout | bones + 1 (head), or the largest step | `{effect:{label?,tex?,note?,tone?,step?,at?},nodes:{id:str\|int,label?,tex?,note?,tone?,parent?:str\|int,step?,at?}[],edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[]}` — nodes without parent are main bones (categories); their children are causes, grandchildren finer causes (3 levels max) |
| `<m-flow>` | Flow chart: boxes and arrows by step | largest node/edge step | `{nodes:{id:str\|int,label?,tex?,x:num,y:num,w:num,h:num,step?,tone?,at?,shape?:str}[],edges?:{from:str\|int,to:str\|int,step?,label?,tone?,dash?:bool,kind?:"money"\|"service"\|"data",amount?:str\|num,shift?:num,pulse?:bool\|any[],pulseAt?:num,offset?:num,at?,loop?:bool\|str}[]}` |
| `<m-kpi>` | KPI cards by step; count-up, change arrow, note | largest card step (default 1 card = 1 step) | `{cards:{label?,value:num,digits?:int,unit?:str,prefix?:str,from?:num,tone?,delta?:{dir?:"up"\|"down",text?:str,good?:bool},note?,step?,at?}[]}` |
| `<m-menu>` | Grid of slide-link cards (contents); plain <a href="#<slide id>">; visited mark | ceil(cards / per-step) (per-step="0": 0) | child `<a href>` links (not JSON) |
| `<m-pie>` | Pie/donut; labels inside big slices, leader lines for small | 1 (all at once); per-step n slices; or slice step | `{slices:{label?,value:num,tone?,step?,place?:"auto"\|"in"\|"out"}[],center?:str}` — the slices go in "slices" (not "data" or "groups"); value is a number, not a percentage string; the slices are drawn clockwise from 12 o'clock in the written order |
| `<m-predict>` | Predict, reveal; votes as bars, answer framed | 0 question, 1 bars, answer-step (2) | `{question?:str,choices:{label,tone?}[],answer:int,counts?:int[],note?,labels?:{correct?:str}}` — choices are objects {"label": …} (not strings); answer is the 0-based index of the right choice; counts (optional) has one whole number ≥ 0 per choice |
| `<m-quad>` | 2-axis positioning map (4 quadrants); points one per step | largest step / to.step (1 point = 1 step) | `{x?:{lo?:str,hi?:str},y?:{lo?:str,hi?:str},quads?:{tr?:str,tl?:str,bl?:str,br?:str,fill?:str},items:{label?,x:num,y:num,step?,at?,tone?,anchor?:"right"\|"left"\|"above"\|"below",r?:num,self?:bool,to?:{x:num,y:num,label?,step?,at?}}[]}` |
| `<m-scatter>` | Scatter plot; point series by step, then a trend line (least squares or 2 points) | series + trend (default 1 series = 1 step, lines 1 step) | `{series:{label?,tone?,step?,at?,points:([num,num]\|{x:num,y:num,label?,anchor?:"right"\|"left"\|"above"\|"below"\|"top"\|"bottom",tone?})[]}[],trend?:str\|{fit?:"linear",pts?:[[num,num],[num,num]],series?:int\|any[],label?,tone?,dash?:bool,step?,at?,digits?:int}\|[the same {…},…]}` — points are [x, y] or {"x", "y", "label"}; axes go in attributes (xr="[0,10]" xl="…"); trend is "linear" or {"fit": "linear", "label": "…"} or {"pts": [[x0, y0], [x1, y1]]} |
| `<m-timeline>` | Timeline; events one by one; periods as bands, overlaps stacked; end exclusive ("1912" = start of 1912) | event count (default 1 per step in time order; per-step n each; `node` step wins) | `{nodes:{id?:str\|int,label?,tex?,note?,tone?,when:num\|str,whenLabel?:str,end?:num\|str,lane?:str,step?,at?,after?:(str\|int)[],progress?:num}[],edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[]}` — when / end: a number or "YYYY", "YYYY-MM", "YYYY-MM-DD"; end is exclusive ("1912" is the start of 1912). whenLabel: the date text shown instead of the computed one (when still sets the position). A `node` with end is a period (a band); lane groups bands into named lanes |
| `<m-tree>` | Hierarchy tree (org chart, taxonomy), built level by level from the root; auto layout | depth (by="level") or `node` count (by="node"); or the largest step | `{nodes:{id:str\|int,label?,tex?,note?,tone?,parent?:str\|int,branch?:str,step?,at?}[],edges?:{from:str\|int,to:str\|int,label?,tone?,dash?:bool,step?,at?}[],path?:(str\|int)[],pathStep?:int,pathNote?:str}` — exactly one `node` without parent (the root) |
| `<m-venn>` | Venn of 2–3 sets, one by one; then overlaps with items | sets + 1 (overlaps="each": sets + overlaps with items, or all overlaps if none) | `{sets:{label,tone?}[],regions?:{A?:str[]\|str,B?:str[]\|str,C?:str[]\|str,AB?:str[]\|str,AC?:str[]\|str,BC?:str[]\|str,ABC?:str[]\|str}}` |

### `<m-bars>`

Data example (child `<script type="application/json">`): `{"series":[{"label":"Sales"}],"groups":[{"label":"Year 1","value":1.2},{"label":"Year 2","value":3.4}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `orient` | string | `"v"` | v or h |
| `max` | number | `0` | axis max (0 = auto) |
| `unit` | string | `""` | value unit |
| `digits` | number | `0` | decimals |
| `per-step` | number | `1` | groups per step (0 = all) |
| `count` | bool | `false` | count values up |
| `ticks` | bool | `true` | ticks and grid |
| `al` | string | `""` | axis title |
| `stack` | bool | `false` | stack values; "percent" = 100 % |

For quantities shown and compared one at a time: yearly sales, ranked answers, before/after.

- group: `label` (`\n` = 2 lines), `value` or `values` (one per series), `step`, `at` (start s), `tone` (bar and value colour)
- series: `label` (2+ series: on the first group's bars; no legend), `tone` (default `--series-1..4`)
- scale: `[{"step": 3, "max": 27, "at": 0.4}]`: the max moves to `max` over `zoom` s; the old range stays as a faint band; taller bars stop at the top and grow as it widens
- `orient="h"`: names left, values right; `ticks="false"` for ranks
- `stack="true"` (`"percent"` = 100 %): a group's `values` in one bar; total at the end, values inside segments; values ≥ 0

Notes

- Values appear once a bar is fully grown; `count="true"` counts them up
- Series names sit on the first group's bars: keep to 2–3 series

### `<m-cards>`

Data example (child `<script type="application/json">`): `{"cards":[{"icon":"user","title":"Listen","text":"Hear the problem"},{"icon":"bulb","title":"Think","text":"Find 3 ideas"},{"icon":"rocket","title":"Try","text":"Build small, show"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `layout` | enum | `"row"` | row, or grid (2×2; 3×2 for 5–6) |
| `arrows` | bool | `false` | order arrows (grid: Z order) |
| `nums` | bool | `false` | number circles |
| `hilite` | string | `""` | last or a number (from 1) |
| `per-step` | number | `1` | cards per step (0 = all) |

3–4 short equal points or a 2×2: try cards over bullets; short steps: cards with arrows. Long or unequal items: bullets.

(2–6 cards).

- `title`: required, ≤ 2 lines. `text`: wraps; overflow cut with …, reported
- `icon`: Tabler name (below); unknown = dashed box, reported
- `n`: circle text (`"A"`, `"1"`); `nums` numbers the rest 1, 2, 3 …
- `tone`: circle and icon colour (`term`, `emph`, `accent2`, `series-1..4`)
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

### `<m-compare>`

Data example (child `<script type="application/json">`): `{"sides":[{"label":"Paper form","tone":"muted"},{"label":"Online form"}],"rows":[{"label":"Hours","values":["Weekdays 9–17","24 h"],"better":1,"diff":"Any time"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `28` | value text px (shrinks to 24) |
| `diff-label` | string | `""` | diff column heading |

2–3 things on the same points (old vs new, A vs B). Bars: `m-bars`; one number: `m-kpi`.

- `sides`: 2 or 3; `label` = column heading; `tone` (`term`, `emph`, `muted`, `accent2`, `series-1..4`; default `term`, `accent2`, `series-4`); `muted` = old
- `rows`: `label` = point (optional); `values` in column order (text/number; `\n`), count = `sides` (else error card)
- `diff`: short difference, `--emph`, right column
- `better`: better column index (from 0): bold, `--emph` frame at diff step
- Steps: column 1 (+ point names) → 2 → (3) → diffs; column `step` overrides
- `variant`: `fade` (default), `slide`, `reveal` (row by row); same steps

### `<m-curves>`

Data example (child `<script type="application/json">`): `[{"label":"Demand D","f":"10 - x"},{"label":"Supply S","f":"2 + x"},{"label":"Equilibrium","pts":[[4,0],[4,6]],"dash":true}]`

| prop | type | default | meaning |
|---|---|---|---|
| `xr` | json | `[0, 1]` | x range |
| `yr` | json | `[0, 1]` | y range |
| `xt` | json | `[]` | x ticks |
| `yt` | json | `[]` | y ticks |
| `xf` | number |  | x tick decimals |
| `yf` | number |  | y tick decimals |
| `xl` | string | `""` | x title |
| `yl` | string | `""` | y title |
| `n` | number | `300` | samples |
| `lw` | number | `3.5` | line width |
| `size` | number | `0` | text px (≥ 24; 0 = default) |

One comparison at a time: mean, median, quantiles; losses.

Series: a JSON array in a child script. One series = one step; same `step` = together.

| Field | Meaning |
|---|---|
| `label` | line name |
| `f` | expression in x (see below) |
| `pts` | points `[[x, y], …]` |
| `tone` | `term` `emph` `accent2` `muted` `fg` `series-1..4` |
| `dash` | dashed |
| `area` / `areaLabel` | shaded span `[a, b]` (several; null = edge), labels |
| `labelAt` / `anchor` / `dx` / `dy` / `ly` | name at x = `labelAt` (default: end); `anchor` `right` `left` `above` `below`; `ly` = y |

`f` is arithmetic, not code: numbers, `x`, `Math` functions/constants (`sin(x)`, `PI`; no `random`), `N(x, mean, sd)`, `+ - * / % **`, comparisons, `&& || !`, `? :`. Powers: `**`. An unreadable `f` shows a card.

### `<m-cycle>`

Data example (child `<script type="application/json">`): `{"center":{"label":"PDCA"},"nodes":[{"label":"Plan"},{"label":"Do"},{"label":"Check"},{"label":"Act"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `per-step` | number | `1` | stages per step (0 = all) |
| `size` | number | `26` | box text px (shrinks to 24) |

Stages that repeat in order: PDCA, water cycle, cell cycle. No coordinates; list stages in order (conventions §2).

(`center`, `edges` optional).

- `nodes`: stages (3–8), in order clockwise from 12; arcs to the next, last→first automatic
  - `label` (`\n`) or `tex` (KaTeX), `note` (small 2nd line, `--muted`), `tone` (`term` default, `emph`, `muted`, `accent2`, `series-1..4`), `step`, `at`, `id`
- `center`: middle name, an object (`{"label": "PDCA", "note": "…"}`); appears with stage 1 (`center.step`). `m-pie`'s `center` is a string
  - same fields as nodes, no `id`; `tone: emph` box: `--emph-tint` fill, `--emph` frame/text
- `edges`: extra links (`from` `to` = `node` `id`s, `label` `tone` `dash` `step`); dashed arrows edge to edge
- Arrows `--muted`, 3 px

Layout:

- Wide spaces: ellipse up to 1.9× wider (never taller); sized to fit the element
- Incoming arrow appears with its box; last→first after the last box
- `variant`: `fade` (default), `draw` (arrows first), `grow`; same steps and end
- `cues(k)`: start times of 2nd+ boxes in one step

### `<m-fishbone>`

Data example (child `<script type="application/json">`): `{"effect":{"label":"Late delivery"},"nodes":[{"id":"p","label":"People"},{"id":"p1","label":"Short-staffed","parent":"p"},{"id":"m","label":"Machines"},{"id":"m1","label":"Truck breakdown","parent":"m"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `order` | string | `"causes-first"` | causes-first (default) or effect-first |
| `size` | number | `0` | box text px (0 = 27, shrink to 24) |

Grouped causes of one effect (e.g. 4M: people, machines, methods, materials). No coordinates.

(`edges` optional).

- effect (head): `label` (`\n`) or `tex`, `note` (under box), `tone` (default `emph`), `step`, `at`
- node: `id`, `label` (or `tex`), `note`, `parent`, `tone`, `step`, `at`. No `parent` = main bone; child = cause; grandchild = sub-cause (3 levels)
  - Bones in array order, left to right, top/bottom alternating; name boxed at the outer end (`note` outside)
  - Cause `tex` = KaTeX; `note` small after the name (`--muted`)
  - `tone`: bone = box and bone; cause = text and line (`emph` bold)
- edge: extra cause links (`from` `to` `label` `tone` `dash` `step`), dashed arrow bulging left of text; best within one bone
- `order`: `causes-first` or `effect-first` (head, spine first); `node` `step` wins
- `variant`: `fade` (default), `draw` (lines first), `grow` (boxes grow in); moves ≤ 12 px
- Fit (1280×720 body, ~440 px high): ≤ 3 rows (causes + sub-causes) per bone (4 if short), 4–6 bones, causes ≤ ~10 chars. Text ≥ 24 px; overflow spills and is reported. Too many: split or shorten

### `<m-flow>`

Data example (child `<script type="application/json">`): `{"nodes":[{"id":"a","label":"Observe","x":20,"y":40,"w":200,"h":70,"step":1},{"id":"b","label":"Update","x":320,"y":40,"w":200,"h":70,"step":2}],"edges":[{"from":"a","to":"b","step":2}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `26` | box text px |
| `pulse-n` | number | `3` | pulse dots |
| `label-gap` | number | `12` | min label–box gap px |

; px; `x`, `y` = box top-left, `w`, `h` = size.

- node: `id`, `label` (`\n`) or `tex` (KaTeX), `step`, `tone` (`term`/`emph`/`muted`), `at` (start s), `shape:"diamond"` (decision; ~2× text width)
- edge: `from` `to` `step` (default: later end), `label`, `tone`, `dash`, `offset` (label gap), `at`, `loop` (back edge: `"left"` `"right"` `"top"` `"bottom"` or `true` = auto)

### `<m-kpi>`

| prop | type | default | meaning |
|---|---|---|---|
| `cols` | number | `0` | cards per row (0 = count, ≤ 4) |
| `digits` | number | `0` | decimals (card wins) |
| `per-step` | number | `1` | cards per step (0 = all) |
| `count` | bool | `true` | count up |
| `size` | number | `0` | number px (0 = auto) |

- `label`: above. `value` (`digits`, commas). `unit`: after. `prefix`: before (`+`, `~`). Negative `value` has its own −: no `prefix` `−` (−−12); `prefix: "−"` only with a positive decrease
- `from`: count start (default 0; may count down)
- `tone`: number, top band (`term`, `emph`, `accent2`, `series-1..4`)
- `delta`: `{"dir": "up" | "down", "text": "+4", "good": true}`: ▲/▼ + text; good (default `up`) `--term`, bad `--emph`
- `note`: bottom line
- `variant`: `count` (default), `rise`, `flip`, `underline`; `count="false"` → `rise`
- `cues(k)`: start times of 2nd+ cards in a step (for `{cue}`)

### `<m-menu>`

| prop | type | default | meaning |
|---|---|---|---|
| `cols` | number | `0` | columns (0 = auto) |
| `per-step` | number | `0` | cards per step (0 = all, no steps) |
| `size` | number | `34` | title px |
| `visited` | bool | `true` | mark visited cards |

Contents; choosing where to start. Add the menu after import; in the first draft use a plain list.
```html
<m-menu cols="3" aria-label="Today">
  <a href="#s-njd4kp" data-icon="1" data-sub="Poet">Poem A</a>
  <a href="#s-uhqygr:2" data-icon="2" data-sub="Order">Poem B</a>
</m-menu>
```

- One child `<a href>` = one card. `href`: `#<slide id>` (step 0) or `#<id>:<step>` (`0`, `1`, … `concl`); ids are added on import; content = title
- `data-icon`: circle text (`1`, `A`). `data-sub`: subtitle
- `per-step="n"`: n cards per step (from `data-from`); unshown cards inert. `0` = all at once
- `cols` default: ≤ 3 cards 1 row, 4 → 2, more → 3. Min height `--mm-h` (104px), gap `--mm-gap` (18px). Fill, centred: `style="height:100%;align-content:center;--mm-h:150px"`

### `<m-pie>`

Data example (child `<script type="application/json">`): `{"slices":[{"label":"Food","value":7.2},{"label":"Housing","value":8.5},{"label":"Other","value":2.1,"tone":"muted"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `donut` | number | `0` | inner radius ratio (0 = pie) |
| `unit` | string | `""` | value unit |
| `digits` | number | `0` | value decimals |
| `pct-digits` | number | `0` | percent decimals |
| `show` | string | `"pct"` | pct, value, both or none |
| `per-step` | number | `0` | slices per step (0 = all) |

Shares of a whole, all at once. Fine comparison: `m-bars`.

- slice: `label`, `value` (percent computed), `tone` (`term` `emph` `accent2` `muted` `fg` `series-1..4`), `step`, `place` (`auto` default, `in`, `out`)
  - Clockwise from 12 in order; "Other" last, `"tone": "muted"`
  - ≤ 6–7 slices
- `center`: hole text, a string (`\n`; `{total}` = sum, e.g. `"Answers\n{total}"`); `m-cycle`'s `center` is an object
- `donut`: `0.5`–`0.6`
- `show` (under name): `pct` (default), `value`, `both`, `none`
- `unit` `digits`: value unit, decimals; `pct-digits` (default 0). Percents rounded to sum to 100%
- Steps: all at step 1; `per-step="1"` only if narrated slice by slice (outline faint). Slice `step` wins
- `variant`: `fade` (default), `sweep` (clockwise from 12), `grow` (rim grows out)

### `<m-predict>`

Data example (child `<script type="application/json">`): `{"question":"Which falls first?","choices":[{"label":"Heavy"},{"label":"Light"},{"label":"Same"}],"answer":2,"counts":[14,3,9],"note":"No air: same"}`

| prop | type | default | meaning |
|---|---|---|---|
| `answer-step` | number | `2` | 2 or more (default 2); after the step-1 count |
| `unit` | string | `""` | count unit |
| `poll` | string | `""` | poll id (no live counts yet) |
| `ticks` | bool | `true` | grid |

- 2–6 choices. Video/print/start show `counts` (or 0)
- Script uses `counts`; vote at `{note:hands up}` (parens get read)
- `poll="p1"`: reserved; no live reveals yet (`ctx.live.poll(id)` is null), so viewer/author counts are used

### `<m-quad>`

Data example (child `<script type="application/json">`): `{"x":{"lo":"Manual","hi":"Auto"},"y":{"lo":"Costly","hi":"Cheap"},"items":[{"label":"Co. A","x":0.25,"y":0.7},{"label":"Us","x":0.8,"y":0.82,"self":true}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `26` | label px |
| `quads-step` | number | `0` | quadrant-name step (0 = start) |

Positioning, effect×effort, SWOT: show the empty space.

- `x` `y`: axis end words (step 0)
- `quads`: names (tr = top-right, tl, bl, br); `fill: "tr"` tints one; names at `quads-step`
- item: `label`, `x` `y` (0–1; 0.5 = axis cross), `step` (default next), `at`, `tone` (`term`/`fg`; default muted), `anchor` (`right`, `left`, `above`, `below`), `r`
- `self: true`: big `--emph` point, ring pulse
- `to: {"x", "y", "label", "step", "at"}`: slides at `to.step` (default next), dashed trail; `label` on arrival
- `cues(k)`: start times of 2nd+ points in a step, for `{cue}`

Notes

- Quadrant names avoid points and labels (else labels move, or `ctx.report`)
- Label overlaps not fixed: change `anchor` or shift

### `<m-scatter>`

Data example (child `<script type="application/json">`): `{"series":[{"label":"Sunny","points":[[24,210],[28,380],[31,560],{"x":34,"y":690,"label":"Heatwave"}]}],"trend":"linear"}`

| prop | type | default | meaning |
|---|---|---|---|
| `xr` | json | `null` | x range |
| `yr` | json | `null` | y range |
| `xt` | json | `null` | x ticks |
| `yt` | json | `null` | y ticks |
| `xf` | number |  | x tick decimals |
| `yf` | number |  | y tick decimals |
| `xl` | string | `""` | x title |
| `yl` | string | `""` | y title |
| `r` | number | `9` | point radius px |

Relation of two quantities (heat vs sales). Points, then trend.

- series: `points` (`[x, y]` or `{"x", "y", "label", "anchor", "tone"}`), `label` (series name, top with marker), `tone` (`term` `emph` `accent2` `muted` `fg` `series-1..4`), `step` (1 series = 1 step; same = together), `at` (start s)
  - Point `label` placed clear of overlaps (`anchor` = first try: `right` `left` `above` `below`); outliers only
  - Marker shape per series; repeats after 4, so ≤ 4 series
- trend: `"linear"` (least squares on all points), or `{"fit": "linear", "series": 0, "label", "tone", "dash", "step", "at", "digits"}`, or `{"pts": [[x0, y0], [x1, y1]]}` (segment; exactly 2 points; vertical OK); several = array
  - `series`: fitted series index from 0, or array (default all)
  - `label`: `{r}` correlation, `{a}` slope, `{b}` intercept (`digits`, default 2), e.g. `"Trend (r = {r})"`
  - `step`: default after the last series
  - Clipped to the plot; lines outside reported. Vertical `pts`: `{a}` `{b}` empty; `{r}` only for fits
- Axes: `xr` `yr` range, `xt` `yt` ticks, `xf` `yf` decimals, `xl` `yl` titles; range/ticks auto if omitted
- `variant`: `fade` (default), `sweep` (left to right), `grow` (points grow, line from the middle)
- Show later steps faintly (`ctx.preview`): later points and lines faint

### `<m-timeline>`

Data example (child `<script type="application/json">`): `{"nodes":[{"id":"a","label":"Meiji Restoration","when":"1868","whenLabel":"Meiji 1"},{"id":"b","label":"Constitution","when":"1889","note":"Feb 11"},{"id":"c","label":"Sino-Japanese War","when":"1894","end":"1895","tone":"emph"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `orient` | string | `"h"` | h or v |
| `scale` | string | `"time"` | time or even |
| `per-step` | number | `1` | events per step (0 = all) |
| `size` | number | `26` | label px (shrinks to 24) |
| `unit` | string | `""` | ticks: day, week, month |
| `today` | string | `""` | today line (YYYY-MM-DD) |

History, lives, schedules. No coordinates; content and times only.

(`edges` optional).

- `when`: number (`1868`, `-500`, `0.5`) or `"YYYY"` `"YYYY-MM"` `"YYYY-MM-DD"`; shown as the date line
- `whenLabel`: text replacing the date ("Meiji 1"); `when` still sets position
- `label` (`\n`) or `tex` (KaTeX)
- `note`: small last line in the box (`--muted`); after the name for periods/milestones
- `tone`: `term` (default), `emph`, `muted`, `accent2`, `series-1..4`
- `end`: period, a band below the axis; name inside (or beside); `\n` names thicken it
- `end` is exclusive: Meiji 1868–1912 and Taishō 1912–1926 share a row; through December = next month (`"2027-01"`)
- `lane`: named group of rows ("Eras", "Authors"); overlaps stack within; `lane` without `end` = milestone (◆)
- `step`, `at` (start s)
- `edges`: extra links (`from` `to` `label` `tone` `dash` `step`); dashed arrows (`dash: false` solid)
- Schedules: `after: ["id", …]` (arrow end→start), `progress` (0–100 %); `today` line; tick `unit`
  - `after` only between periods and milestones; `today` needs a period

Layout:

- `orient`: `h` (default) or `v`; `scale`: `time` (default) or `even` (very uneven gaps)
- Events (no `end` or `lane`): axis dot plus date-and-name box, alternating sides (`v`: left/right); 2 rows when crowded
- With periods: round ticks; event boxes all above the axis
- Steps: time order, periods and events together; the axis comes with the first
- `variant`: `fade` (default), `draw` (lines first, bands drawn), `grow` (boxes grow, bands stretch); same steps and end
- Show later steps faintly (`ctx.preview`): later items faint
- `cues(k)`: start times of 2nd+ items in a step (for `{cue}`)

### `<m-tree>`

Data example (child `<script type="application/json">`): `{"nodes":[{"id":"r","label":"Animals"},{"id":"a","label":"Vertebrates","parent":"r"},{"id":"b","label":"Invertebrates","parent":"r"}]}`

| prop | type | default | meaning |
|---|---|---|---|
| `orient` | string | `"down"` | down (default) or right |
| `by` | string | `"level"` | level (default) or `node` (depth-first) |
| `link` | string | `"elbow"` | elbow (default) or straight |
| `size` | number | `0` | box text px (0 = 27, shrink to 24) |

Parent–child structures (org charts, taxonomies, outlines). No coordinates; laid out without overlaps.

(`edges` optional).

- node: `id`, `label` (`\n`) or `tex` (KaTeX), `parent` (parent `id`; exactly one root without `parent`), `note` (small, **under** box), `tone` (`term` default, `emph`, `muted`, `accent2`, `series-1..4`), `step`, `at` (start s)
- Children in array order; parent centred over them
- edge: extra links (`from` `to` `label` `tone` `dash` `step`), dashed arrow outside the tree; best at same depth; step: later end
- Child `branch`: line text (e.g. probability). `path`: root-first `id`s highlighted in turn (default 1 step per line, after the tree; `pathStep`: in one step; `pathNote`: end note)
- `orient="right"` for wide taxonomies. `by="node"`: one at a time, depth-first (to follow a branch). Node `step` wins
- Lines `--muted`, 3 px; `tone: emph` box: `--emph-tint` fill
- Fit (~440 px high): ~8 four-character boxes per level (`down`), ~7 (`right`); ~5 levels. More leaves: 2 staggered rows (~16 / ~11), then 2-line names. Text ≥ 24 px; overflow spills, reported. Too many: split
- `variant`: `fade` (default), `draw` (lines first), `grow`
- Show later steps faintly (`ctx.preview`): later parts faint

### `<m-venn>`

Data example (child `<script type="application/json">`): `{"sets":[{"label":"Mammals"},{"label":"Sea animals"}],"regions":{"A":["Lion"],"B":["Tuna"],"AB":["Whale","Dolphin"]}}`

| prop | type | default | meaning |
|---|---|---|---|
| `size` | number | `26` | item text px (shrinks to 24) |
| `spread` | number | `1` | centre distance ÷ radius (0.7–1.3) |
| `overlaps` | string | `"together"` | together or each |

Shared and distinct traits. Per-point values: `m-compare`.

- `sets`: 2 or 3; `label` outside; `tone` (`term`, `emph`, `muted`, `accent2`, `series-1..4`; default `term`, `accent2`, `series-4`). Avoid `emph` (used for overlaps)
- `regions`: items per region (array or `\n` text). Keys: letters in alphabetical order, A B C = `sets` order:
  - `A`: only A; `AB`: A and B (with 3 sets, not C); `ABC`: all three
  - 2 sets: `A` `B` `AB`; 3: `A` `B` `C` `AB` `AC` `BC` `ABC`; all optional. C keys with 2 sets: error card
- Area not to scale. `spread` (default 1): smaller = more overlap
- Overlap items bold; 1–2 words with 3 sets
- Steps: each set with its own items → overlaps (those with items tinted `--emph`, outlined, items shown; if none have items, all). `overlaps="each"`: one by one (`AB`, `AC`, `BC`, `ABC`)
- `variant`: `fade` (default), `draw` (outlines first)
