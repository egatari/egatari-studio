---
summary: Timeline; events one by one; periods as bands, overlaps stacked; end exclusive ("1912" = start of 1912)
steps: event count (default 1 per step in time order; per-step n each; node step wins)
props:
  orient: h or v
  scale: time or even
  per-step: events per step (0 = all)
  size: label px (shrinks to 24)
  dur: event appear (s)
  stagger: event offset (s)
  unit: ticks: day, week, month
  today: today line (YYYY-MM-DD)
example: {"nodes": [{"id": "a", "label": "Meiji Restoration", "when": "1868", "whenLabel": "Meiji 1"}, {"id": "b", "label": "Constitution", "when": "1889", "note": "Feb 11"}, {"id": "c", "label": "Sino-Japanese War", "when": "1894", "end": "1895", "tone": "emph"}]}
---

History, lives, schedules. No coordinates; content and times only.

Child JSON: `{"nodes": [...], "edges": [...]}` (`edges` optional).

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

The demo is `demo.html`; the schedule is fictional, years are history.

<!-- llm: omit -->
Notes

- Box and tick widths estimated from characters (CJK 1, digits 0.6, Latin 0.62)
- No fit: names shrink from `size` by 2px to 24px, then `ctx.report("size", …)`
- No `Date` (leap years computed); months and days as positions in the year
- Band names sit in the band's `g`
- Axis `--muted` 5 px; lane dividers `--line`; links and `edges` `--muted` 3 px
- Motion: boxes and bands move ≤ 12 px from the axis side, within `fade` time (conventions §1.2)
<!-- llm: end -->

<!-- llm: omit -->
Schedules (`after`, `progress`, `today`, `unit`)

- Any `after`: one row per task in each lane (written order). Arrows only between periods and milestones (others reported)
- Arrows (`--muted` 3px, right-angled) from a task's end to the next one's start; drawn with the later task; avoid crossing bands where possible
- A last milestone gets room for its name; arrows to bands whose name is left of the start enter at the edge
- `progress`: band filled darker from the start; "70%" shown if room; outside 0–100 clamped and reported
- `today`: only with periods (else reported); small triangle and vertical line (`--accent2`, 3px), "Today" below; range widens to include it
- `unit`: default month (≤ 4 years with months/days) or round numbers. `day`: 1–2 days or 1–8 weeks (Mondays); `week`: 1–26 weeks; `month`: 1–120 months; finest step whose 24px labels don't overlap; minor ticks unlabeled. Day/week labels "11/2"; `day` shades weekends (`--line`)
- No plan-vs-actual bands yet
<!-- llm: end -->
