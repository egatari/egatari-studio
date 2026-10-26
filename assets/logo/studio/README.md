# Egatari Studio icon 「す」 / Egatari Studio のアイコン「す」

Studio's own mark: す in the Egatari brackets, with the 緋 ring, in the same system as 「え」 (`../`): 紺藍 `#4A488E` and 緋 `#D3381C`; dark `#A9ABFA` and `#F2573B`.
Studio の印。え（`../`）と同じ決まり（紺藍・緋、暗い画面の色）で、かぎ括弧の中の「す」と緋の輪。

## Sources / 元の絵（`src/`, chosen by the owner, 2026-10-27）

| File | Use |
|---|---|
| `src/studio-{light,dark,black,white,indigo}.svg` | Masters (256), 48 px and up |
| `src/studio-32-*.svg` | Optical drafts for 24–32 px |
| `src/studio-16-*.svg` | Optical drafts for 16 px (may be hand-refined later) |

## Built files / 作るもの（`node tools/studio-icons.mjs`）

| File | Made from |
|---|---|
| `favicon.ico` / `favicon-dark.ico` | 16 (`src/studio-16-*`), 32 (`src/studio-32-*`), 48 (`src/studio-*`) |
| `favicon.svg` | `src/studio-32-light` with the dark colours under `prefers-color-scheme` (as 「え」's `kit/core/favicon.mjs`) |
| `apple-touch-icon.png` | 180 px, the light master on an opaque white tile |
| `icon-192.png` / `icon-512.png` | the light master, transparent (Studio's web app manifest) |

**Swapping a refined small size is one command:** replace `src/studio-16-light.svg` and `src/studio-16-dark.svg` (or the 32 ones), then run
`node tools/studio-icons.mjs`. A hand-drawn bitmap also works: `hand/su-16-light.png` and `hand/su-16-dark.png` (16 × 16) are used as they are.
`node tools/studio-icons.mjs --check` checks the sizes and that `favicon.svg` matches `src/`; `--sheet <dir>` writes a contact sheet to look at.

Where each mark is used: 「え」 (`assets/logo/`) is the Egatari mark: the header logo, Egatari Viewer, and the favicon of exported `.ega.html` files.
「す」 (this folder) is only Studio's tab and Home Screen icon (`tools/build-app.mjs`).

The licence is that of `assets/logo/` (see `../README.md`): not covered by the MIT license.
