# Changes to the strokesvg kana shapes (FONTLOG)

Source: strokesvg <https://github.com/zhengkyl/strokesvg>, commit `e4c2c91034e03c9c2f4e95f14f2361a948f52cd0`
(kana SVGs derived from Klee One; SIL OFL 1.1). Converted by `tools/kana-import-strokesvg.mjs`. These changes are
part of the OFL-licensed work.

- 2026-10-26 — Format and precision. Each character's strokes in writing order; each stroke a list of pieces
  `[outline, centreline]` (strokesvg splits a stroke that crosses itself into pieces, each with its own clip; they
  stay grouped as one stroke). Coordinates scaled from strokesvg's 1024 box to 0–100 (×100/1024) and rounded to
  0.1, written as one absolute move and then relative commands; arcs kept. The brush (strokesvg's stroke width 128)
  is 12.5.
- 2026-10-26 — **半濁点** of ぱ ぴ ぷ ぺ ぽ パ ピ プ ペ ポ: the circle's centreline is redrawn to **start at the bottom
  centre and go clockwise** (bottom → left → top → right, and a little past the start), as taught in 光村図書
  『こくご一（上）』p.27 (半濁点) and p.37 (句点): 「下中心から時計回り」. Its centre and radius come from the circle's
  own outline (the middle of the ring); the outline is unchanged. strokesvg's line started above the ring and went
  anticlockwise.
- 2026-10-26 — **っ ッ ゎ ヮ ヵ ヶ** added (not in strokesvg). Each is its base character (つ ツ わ ワ カ ケ) scaled
  uniformly and moved so that its outline box fits Klee One's own small glyph box (read from the font's metrics;
  the scale and move are recorded under `"derived"` in the file). Checked against the Klee One small glyphs by
  overlay: they match within about 0.3 units (the font's small forms are very slightly bolder).
