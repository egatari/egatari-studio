<!-- i18n: pair=README.ja.md sha256=3d692c529201acca -->
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

## The conclusion row (1.2.0)

From the plain-theme proposal by @totasuko-lab (1.1.0 took its colours). The conclusion row is marked by four cues, so it does not depend on colour alone (WCAG 1.4.1): a 5px bar in `--emph` on its left, its fixed position (top 571px, height 72px, as before), bold text, and a light ground `--concl-bg`. The text is left-aligned from the bar instead of centred in a frame. Vertical slides (`layout-tate`) keep the framed conclusion column.

| `--concl-bg` candidate | `--emph` text | `--fg` text | ground vs white | `--emph` text, 15% washout |
|---|---|---|---|---|
| `#FFFFFF` (1.1.0: transparent) | 5.80:1 | 15.91:1 | 1.00 (none) | 3.37:1 |
| **`#F5F5F5`** (chosen) | **5.32:1** | **14.59:1** | 1.09, ΔE00 2.0 | 3.13:1 |
| `#F6F3EF` (proposal's warm off-white) | 5.24:1 | 14.38:1 | 1.11, ΔE00 3.2 (2.3 in greyscale) | 3.10:1 |

- **`--concl-bg` `#F5F5F5`.** A neutral grey has no hue, so it looks the same for every colour-vision type and in greyscale print: the row reads as a band everywhere to the same degree. The bar and bold carry the cue, so the ground only needs to be just visible; this one costs the least contrast among the grounds that still separate the row (`--emph` 5.32:1, above AA for any size). The warm `#F6F3EF` is a little more visible in colour, but in greyscale it separates less than its colour suggests and it costs more contrast.
- Themes that extend `default` take the shape: `kokugo` gets the bar in its own red and the grey ground; `business` keeps its own pale-orange `--concl-bg`.

## Light: `--lit` (1.3.0)

`--lit` is the role for light and what it lights (the sun, a lamp, the lit side of the Moon; format spec §8.4). It is a fill colour, never a text colour, and is always drawn with an outline in `--fg` or `--muted`.

| Token | Value | On white | vs `--emph` under simulation (ΔE*ab normal/protan/deutan/tritan; ΔE00) |
|---|---|---|---|
| `--lit` | `#F5B800` | 1.79:1 | 65/55/42/54; 44.4/39.8/28.3/30.7 |

- **`--lit` `#F5B800`.** A warm, slightly amber yellow, the colour people expect for sunlight and lamps. On white it is pale (1.79:1), so the outline carries the shape; the 3:1 of WCAG 1.4.11 is met by the outline, not the fill. Under all four simulated colour-vision types it stays apart from `--emph` by the same limits as `--emph` against `--term` (`node tools/test-themes.mjs`), so the sun and a conclusion are not confused.
- Each bundled theme sets its own `--lit` (a warm yellow fitting its palette; `sumi` and `business` lean away from their orange `--emph`). Themes that extend `default` without setting it inherit `#F5B800`.
