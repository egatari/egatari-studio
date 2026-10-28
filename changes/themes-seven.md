### Added

- Seven bundled themes for new lessons (backlog #129), shown by Japanese colour names with a small note on what each suits: 藍 Indigo (`default`), 墨 Ink (`sumi`, new), 国語 Kokugo (`kokugo`), 常盤 Evergreen (`tokiwa`, new), 江戸紫 Edo purple (`murasaki`, new), 焦茶 Dark brown (`kogecha`, new) and 浅葱 Teal (`asagi`, new, in Zen Maru Gothic); the new ones are 1.0.0. The list is `kit/core/themes-list.mjs`; the editor's New… ③ shows the note under the list and **Change theme…** next to each name.
  Their heading, cover and conclusion-line shapes are fixed CSS snippets (`kit/core/theme-shapes.mjs`), copied into `tokens.css` and recorded in `theme.json` `look`, so the theme builder (#58) can offer the same shapes. Boxes do not move, and theme CSS is never wrapped in `:where()`.
- `tools/test-themes.mjs` (in `npm test`): every bundled theme builds a sample lesson with no contrast, divider, font or metrics warning; role colours reach 4.5:1 (also the conclusion line, divider, cover title and the heading on its band); `--emph` and `--term` stay ΔE*ab ≥ 35 apart under protan and deutan simulation (Machado 2009) and ΔE00 ≥ 20 for all four vision types; the `look` snippets match. Colour maths in `kit/core/color-check.mjs`.

### Changed

- `business` can no longer be chosen for new lessons (editor lists, `npm run new`, which suggests `sumi`); it stays bundled, so lessons that name it or recorded its version build and play as before.
- Instructions for the AI: the theme advice is per situation (business and pitch decks → `sumi`, Japanese language arts → `kokugo`, otherwise `default`), and the business series pack and its worked example use `sumi`. Pack version 74cbc12f; the free kokugo single (ja) is 40,879 B (was 40,931 B, cap 40,960 B).
