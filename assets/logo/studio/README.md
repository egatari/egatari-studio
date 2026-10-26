# Egatari Studio icon 「す」 / Egatari Studio のアイコン「す」

**Placeholder.** These files are typeset (BIZ UDPGothic Bold す with the Egatari brackets, sun and colours), made by
`node tools/studio-icons.mjs`. They will be replaced by the owner's hand-drawn す.

**仮のもの。** BIZ UDPGothic Bold の「す」に、Egatari のかぎ括弧・太陽・色を合わせて組んだもの（`node tools/studio-icons.mjs` が作る）。作者の手描きの「す」ができたら差し替える。

| File | Use |
|---|---|
| `favicon.ico` / `favicon-dark.ico` | Studio's tab icon: 16 (bracketless glyph) / 32 / 48 px; light / dark |
| `apple-touch-icon.png` | 180 px, opaque white tile |
| `icon-192.png` / `icon-512.png` | Studio's web app manifest icons (transparent) |

Where each mark is used: 「え」 (`assets/logo/`) is the Egatari mark: the header logo, Egatari Viewer, and the favicon of exported `.ega.html` files.
「す」 (this folder) is only Studio's tab and Home Screen icon (`tools/build-app.mjs`).

**Swapping in the hand-drawn versions:** put `hand/su-16-light.png`, `hand/su-16-dark.png` (16 × 16) and `hand/su-24-light.png`, `hand/su-24-dark.png`
(24 × 24) here, and run `node tools/studio-icons.mjs` again: the ico files then use them as they are (16 px, and a 24 px entry), without scaling.
For the larger sizes, put `hand/su-256-light.svg` (and `hand/su-256-dark.svg`) drawn on the same 256 square as `../egatari-light.svg`.
`node tools/studio-icons.mjs --check` checks the sizes.

The licence is that of `assets/logo/` (see `../README.md`): not covered by the MIT license.
