### Added

- Fonts a lesson can choose (backlog #133): a fixed list of OFL fonts from `@fontsource` (`FONT_LIST` in `kit/core/build-core.mjs`). Japanese: BIZ UDPGothic (default), BIZ UDPMincho, Shippori Mincho, Zen Maru Gothic, Klee One. English: Source Sans 3 (default), Source Serif 4, Andika, Atkinson Hyperlegible Next. Monospace: Source Code Pro.
  Only the fonts a lesson chooses go into its file, subset to the files with the characters it uses. A theme chooses them with `theme.json` `fonts` (`{"body": …, "heading": …}`), or a theme or the slides name them in CSS. The offline editor carries only the two defaults.
- English bold and italic: lessons in other languages also embed Source Sans 3 italic (400 and 700). In Japanese lessons, Latin text in `<em>` and `<i>` is set in Source Sans 3 italic, embedded only for those characters. A Japanese lesson without such text does not grow.
- Quality check `fontNotEmbedded` (warning, once per lesson): slide text whose font is neither embedded nor generic, so it looks different on each device.
