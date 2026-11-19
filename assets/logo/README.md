# Egatari logo / Egatari のロゴ

The mark is the hiragana え (e, picture) in Japanese corner brackets, with its first stroke drawn as a sun.
ひらがなの「え」をかぎ括弧で囲み、第一画を太陽にしたマーク。

## Licence / 使ってよい範囲

The logo files in this folder, and the favicon, touch icon and app icons made from them, are **not** covered by the
MIT license of this repository (nor by the CC BY license of the specification). You may use them unmodified to refer
to Egatari or to software that reads or writes Egatari files (Egatari-compatible software). Do not alter them or use
them in a way that suggests endorsement.

このフォルダのロゴのファイル（と、そこから作ったファビコン・タッチアイコン・アプリのアイコン）は、このリポジトリの MIT
ライセンス（と仕様の CC BY）の**対象外**です。Egatari、または Egatari のファイルを読み書きするソフトウェア（Egatari 互換の
ソフトウェア）を指すためなら、手を加えずに使ってかまいません。形や色を変えたり、推薦・保証を受けているように見せたりしないでください。

## Files / ファイル

| File | Use |
|---|---|
| `egatari-light.svg` / `egatari-dark.svg` | Master mark (256), 48 px and up; light / dark backgrounds |
| `egatari-32-light.svg` / `egatari-32-dark.svg` | Optical version for 24–32 px (the editor's header) |
| `egatari-lockup-light.svg` / `egatari-lockup-dark.svg` | Horizontal lockup "Egatari" (system-ui 600, height 48 px and up; copied from `lockups/egatari-{light,dark}.svg` of the logo masters) |
| `egatari-studio-light.svg` / `egatari-studio-dark.svg` | Horizontal lockup "Egatari Studio" (system-ui 600, height 48 px and up) |
| `egatari-draw-light.svg` / `egatari-draw-dark.svg` | Stroke-drawing animation (2.5 s, once; final state with reduced motion). Only for waits over about 1 s |
| `egatari-draw-loop-light.svg` / `egatari-draw-loop-dark.svg` | Looping stroke drawing for loading indicators: draw 2.5 s → hold about 1 s → fade about 0.4 s, repeated (3.9 s a cycle); final state with reduced motion. Only for waits over about 1 s; the editor uses this one |
| `favicon.ico` / `favicon-dark.ico` | 16 (bracketless glyph) / 32 / 48 px |
| `apple-touch-icon.png` | 180 px, opaque white tile |
| `icon-192.png` / `icon-512.png` | Web app manifest icons (transparent) |
| `studio/` | Egatari Studio's own tab and app icon 「す」 (sources in `studio/src/`, built by `tools/studio-icons.mjs`; see `studio/README.md`). 「え」 stays the mark for Egatari, Egatari Viewer and exported files |

**Once or looping.** Use `egatari-draw-*` where the drawing is shown once (a splash or an intro); use `egatari-draw-loop-*` for a wait of unknown length (loading, building), so the mark does not sit still as if stuck. Both are self-contained SVG files (CSS animation, no script), so they can be used as files as they are. The logo masters drew the mark once and stopped; the looping version was added by the owner's decision of 2026-11-19.

**一度か、くり返しか。** 一度だけ見せる所（スプラッシュ・導入）には `egatari-draw-*`、長さの分からない待ち（読み込み・ビルド）には `egatari-draw-loop-*` を使う（止まったまま固まったように見えないように）。どちらも自己完結した SVG のファイル（CSS のアニメーション、スクリプトなし）なので、ファイルのまま使える。ロゴの原本は一度だけ描いて完成形で止まる作りだったが、くり返す版を 2026-11-19 の作者の決定で足した。

`favicon.ico`, `apple-touch-icon.png` and `icon-512.png` are copied from the specification repository's logo files; `icon-192.png` and `favicon-dark.ico` are copied from the logo masters (the 16 px and 32 px sizes are hand-fitted, so do not make them by scaling the SVGs).

Colours: light `#4A488E` with sun `#D3381C`; dark `#A9ABFA` with sun `#F2573B` (on `#111`). Keep the aspect ratio and the
clear space (the 256 canvas already contains it; keep at least 6 px around a lockup at 96 px height). Do not use the
mark below 16 px, rotate, stretch, recolour, outline or shadow it, move the sun, or separate the brackets.

縦横比と余白（256 の正方形の中に含む。ロックアップ（「Egatari」「Egatari Studio」）は高さ 96 px のとき周りに 6 px 以上）を保つ。16 px 未満では使わない。回転・変形・色の変更・縁取り・影・太陽の位置の変更・括弧の切り離しをしない。
