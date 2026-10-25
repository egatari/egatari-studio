### Changed

- Theme `business` 1.0.1, `--emph` #C2410C → #BA3C05: the same orange (OKLCH hue 38.4), slightly darker, so that orange text on its own `--emph-tint` reaches 4.66:1 (was 4.34:1, under the 4.5:1 text floor; emph boxes and the kpi, quad and flow components); 5.62:1 on white.
  Protan/deutan ΔE00 to the other tones moves by at most 1.7. A lesson that recorded `business` 1.0.0 keeps it (`theme pinned: …`, `--update-themes`), as for `default` 1.1.0.
- Live: the pressed **I don't follow** button takes the deck theme's `--emph` (was a fixed `#c2410c`), so it matches every theme.
