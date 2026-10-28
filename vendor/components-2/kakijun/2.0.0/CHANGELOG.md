# m-kakijun changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.0, alpha; not for lessons yet)

- Moved to `egatariParts.define({name: "kakijun", version: "2.0.0", requires: {base: "1.0.0"}, element: "m-kakijun"})`,
  extending `base.MotionElement` with `base.el` / `prog` / `variant` / `previewOpacity`; `static partName = "kakijun"`.
  The embedded egatari-variant block is gone (`base.variant`). The DOM is byte-identical to 1.13.0 on its demo and on
  `tools/fixtures/c2-identity/kakijun.html` at every step (tools/test-c2-identity.mjs).
- The two data blocks are now data blocks in the spec's form (egatari-spec ce96072, §6.2): `var KANA =
  /*@egatari-block stroke-meta*/{…}/*@egatari-block-end*/` (MIT; was between `// ---- BEGIN kakijun-data` and
  `// ---- END kakijun-data ----`), and `var STROKES = /* OFL-1.1 data: … */ /*@egatari-block strokes*/{…}/*@egatari-block-end*/`
  (OFL-1.1; was between `/* BEGIN OFL-1.1 data … */` and `/* END OFL-1.1 data */`), the OFL notice comment directly
  before its marker. The strokes block holds `data/kana/strokes.ofl.json`'s values with the characters as its own
  members: `"_license"` first, the file's other fields as `_source`, `_box`, `_brush`, `_format`, `_derived`, then one
  member per character (was: under `chars`). `tools/kana-embed.mjs` writes both. The licence stays `MIT AND OFL-1.1`.
- Reports instead of `console.warn("m-kakijun: …")`, all from `mount` with the 1.13.0 messages: a character without stroke
  data and ー in vertical writing `ctx.report("data", "[kakijun] …")`, `per`, `writing` or `grid` values it does not take
  `ctx.report("attr", …)`, and boxes that do not fit or small-kana labels that do not fit beside them
  `ctx.report("size", …)`. `plan()`, which gives the step count, still reads only the attributes and collects its notes
  for `mount`.
- Subset at build time (spec §6.2): `static build = {subset: [{data: "block:strokes", key: "char"}, {data:
  "block:stroke-meta", key: "char"}]}` and `static glyphs = "0123456789とめはねらい"` (the stroke numbers and ending
  labels it draws). A producer keeps only the characters the lesson uses in both blocks (`"_"` members stay) and records
  `subset: {keys, sha256}` (`tools/subset-produce.mjs` is the stand-in; `tools/test-subset.mjs`). A character a subset
  left out (e.g. after a tier A edit of `text`) is drawn plainly, like a character without data, and reported as `data`
  with "(not in this lesson's subset: …)" after the character. The stroke-meta block starts with `"_keys"`, every
  character of the published data; a producer keeps `"_"` members unchanged, so the part tells a character the subset
  left out (in `_keys`) from one without data (the 1.13.0 message, unchanged).
- The collected notes are forwarded with a literal code per `ctx.report` call (lint checks each); no change in what is
  reported.
- The preview view is `ctx.preview` alone (1.13.0 also accepted `ctx.mode === "lecture"`).
- The part's code now runs in strict mode (1.13.0's had no `"use strict"`).
- Ids: the clip paths are renamed `kakijun-2-0-0-clip-<n>` (1.13.0: `m-kakijun-clip-<n>`), and their start-cap masks
  `kakijun-2-0-0-clip-<n>h` (1.13.0: `m-kakijun-clip-<n>h`), from the part's own counter (deterministic; spec §6.1
  Identifiers). The rewrite is in the identity test's `ID_REWRITES` (`kakijun`).

## 1.13.0

As released in the library's 1.13.0.
