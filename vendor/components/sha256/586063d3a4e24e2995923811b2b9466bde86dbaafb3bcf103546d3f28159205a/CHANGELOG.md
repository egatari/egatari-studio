# m-map-world changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.1.0 (components 2.7.0)

- Colour ramps (spec §8.4 `--ramp-1` … `--ramp-5`): on a theme with ramps, class i of `values` takes the ramp at t = i/(n−1) (base `ramp`), in the map and the legend; the legend with values and the readable list stay. Every stop falls back to the 2.0.3 class colour (mixed from --bg, --term and --fg), so themes without ramps give the same colours. The lightness-gap report is not made on ramp themes (the theme chooses the stops). Uses base 1.2.0 (ramp, rampStops).
- Requires base 1.2.0 (mtext keeps a lone `*` literal and draws `\*` `\_` `\^` as the character).

## 2.0.3 (components 2.4.4)

- Declares static glyphs (built-in names, captions and figures, including the English names), so a built lesson keeps those characters when it subsets its fonts. Without them, built-in names such as Takeshima were drawn in a fallback font and overflowed their label boxes.
- In an English lesson, name and value chips are as tall as the English font's text box (Source Sans 3: 1.43 em) with the baseline set inside it. They were 32 px for 24 px text, and the quality check reported the text 3 px outside (svgTextBox). Japanese lessons draw the same as before.

## 2.0.2 (components 2.2.0)

- Requires base 1.1.0 (sub- and superscripts at least 24px, a measured text-width estimate).
- Fix: legend and chip widths use base's measured textWidth in the deck's font (in place of 0.6 em for chips and 0.72 em for the legend).

## 2.0.1 (components 2.1.2)

- Fix: in a dark theme the value classes collapsed (the lightest class was set below the darkest). When --bg is darker than --fg the lightness ramp now runs the other way, from just above the background and the land colour up toward --fg, so the classes stay apart; the light theme is unchanged.
- Fix: one unknown country key in `values`, `regions` or `categories`, an unknown region group, a value that is not a number, or `classes` that do not increase threw, and the whole map became a placeholder. Each is now reported (`data`) and skipped (classes fall back to the quartiles), and the rest is drawn.
- Fix: a point with `lat` outside −90 to 90 drew NaN; it is now reported (`data`) and not drawn. With an XUD region the aria-label started with an empty name; empty names are left out. The host now has role="figure" so its aria-label is exposed with the readable paragraph.

## 2.0.0 (components 2.0.0-rc.1 and 2.0.0)

- Moved to `egatariParts.define({name: "map-world", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-map-world"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "map-world"`.
  The DOM is byte-identical to 1.13.0 on its demo and on `tools/fixtures/c2-identity/map-world.html` (reported cases,
  the graticule, small elements) at every step (tools/test-c2-identity.mjs).
- The map data (`map-world-data`, from Natural Earth 5.1.1, Japan's point of view, public domain, with its credit lines)
  is byte-for-byte as in 1.13.0.
- Variants: `base.variant(this)` instead of the embedded `egatari-variant` block.
- Reports (1.13.0: collected and written at the end of `mount` as `console.warn("m-map-world: …")`; still collected and
  sent at the same point, same English text, now `ctx.report(code, "[map-world] …")`): `attr` for a `grid`, `labels` or
  `show` value it does not know; `data` for more than 5 classes or 4 categories, XUD (帰属未定地) in values or regions, a
  value below the first class, a country with no shape at this scale, and a flow whose short way crosses the seam (30°W);
  `size` for a label or the legend with no room; `theme` when the theme's colours give classes too close in lightness.
- A local `base` in `mount` (the land paths, never read) is renamed `landPath`, so that it does not hide the base part.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- Ids: none written.

## 1.13.0

As released in the library's 1.13.0.
