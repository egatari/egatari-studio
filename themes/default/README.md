<!-- i18n: pair=README.ja.md sha256=ae9ba9d2ef874aeb -->
# Theme `default`

[日本語](README.ja.md)

The bundled default theme. Its version is in `theme.json`; earlier versions are kept in `vendor/themes/default/<version>/` and listed in `themes.lock.json` ([reference](../../docs/reference.md#themes), “Theme versions”). The build reads only `theme.json` and `tokens.css`; this file is not part of the theme's hash.

## Why these colors (1.1.0)

| Token | Value | On white | Role |
|---|---|---|---|
| `--emph` | `#BE3012` | 5.80:1 (WCAG AA) | conclusions, problems, goals |
| `--muted` | `#5C5853` | 7.06:1 (WCAG AAA level) | known results, comparisons, captions, citations |
| `--fg` | `#222222` | 15.91:1 | body text (the ink) |

- **`--emph` `#BE3012`.** The orange-leaning red that colour universal design (CUD) guidance recommends for people with P- and D-type colour vision, darkened to text strength: 5.80:1 on white, which meets WCAG AA. Under protan simulation its CIEDE2000 distance to the ink rises from 22.5 to 26.0, so a conclusion line does not read as body text. The previous crimson `#C50516` (1.0.0, `oklch(0.52 0.21 27)`) leaned bluish, which CUD advises against; it was never a deliberate choice.
- **`--muted` `#5C5853`.** 7.06:1 on white (WCAG AAA level), so grey text stays readable on projectors, where black is lifted by room light, and at small sizes (`.cite`, `.figcap`). The trade-off is a smaller distance to the ink (CIEDE2000 25.6 → 18.2). That is acceptable because muted text also differs from the ink by role and position (captions, citations, the compared result), not by colour alone.
- Themes that extend `default` without setting these tokens inherit them: `kokugo` keeps its own red (`--emph-hue: 38`) and takes the new grey.
