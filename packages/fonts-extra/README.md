# @egatari/fonts-extra

The optional fonts of [Egatari Studio](https://studio.egatari.org/) (the npm package [`egatari`](https://www.npmjs.com/package/egatari)): Shippori Mincho, Zen Maru Gothic, Klee One, Source Serif 4, Andika, Atkinson Hyperlegible Next and Source Code Pro. Each is a copy of its [@fontsource](https://fontsource.org/) package with only the weights and WOFF2 files that `egatari build` embeds, and its licence (SIL Open Font License 1.1) in `@fontsource/<name>/LICENSE`.

`egatari` carries only its default fonts (BIZ UDPGothic, BIZ UDPMincho and Source Sans 3). A lesson whose theme or CSS names one of these fonts (for example the bundled theme `asagi`, which uses Zen Maru Gothic) needs this package next to `egatari`; without it, `egatari build` and `egatari check` say so and how to install it:

```bash
npm i -D egatari @egatari/fonts-extra
npx -p egatari -p @egatari/fonts-extra egatari build mytalk/deck.html   # without a project
```

The build finds it from the `egatari` package and from the current folder. Its version is its own; `egatari` lists it as an optional peer dependency.

It is built from the `@fontsource` packages in the repository's `devDependencies` by `tools/fonts-vendor.mjs` (its `prepack`), and published from a tag `fonts-extra-vX.Y.Z` (see RELEASING.md).

---

Egatari Studio（npm の包み `egatari`）の選べる字体：Shippori Mincho・Zen Maru Gothic・Klee One・Source Serif 4・Andika・Atkinson Hyperlegible Next・Source Code Pro。どれも @fontsource の包みの写しで、`egatari build` が埋め込む太さと WOFF2 だけを入れ、使用条件（SIL Open Font License 1.1）は `@fontsource/<名前>/LICENSE` にある。`egatari` が持つのは既定の字体（BIZ UDPゴシック・BIZ UDP明朝・Source Sans 3）だけ。テーマか CSS がこれらの字体を名指す教材（同梱のテーマ `asagi`（浅葱）は Zen Maru Gothic）は、この包みを `egatari` と一緒に入れる。ないと `egatari build` と `egatari check` が入れ方を言って知らせる（上のコマンド）。
