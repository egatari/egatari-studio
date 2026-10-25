<!-- i18n: pair=kokugo.ja.md sha256=3c8f30dfbdc21054 -->
## Series pack: kokugo (Japanese language arts)

For 国語 lessons: 漢文, 古文 and 現代文. Use the `kokugo` theme. In the narration, give the reading of hard words and names with `{display|reading}` (R-reading).

- **Vertical slides:** `<section class="slide layout-tate">` sets the whole slide in vertical writing. The `<h2>` is one vertical column at the right edge (about 14 full-width characters; it does not wrap), the body runs in columns from right to left, and the conclusion line is a vertical column at the left edge (about 19 characters). The body must stay between the two columns (the quality checker reports an overlap). Components, figures and tables in the body stay horizontal at the full body width: use their vertical option (`m-kobun tate`, `m-gendai tate`; `m-kanbun` is always vertical).

Components of this pack, in addition to those of §3:

{{CATALOG}}

{{EXTENSIONS}}

{{WORKED kokugo "Worked example: kokugo (kokugo theme, m-kanbun)" m-kanbun}}

Steps: `m-kanbun` gives 訓点 (step 1), then one step per 句 of the reading order, then the 書き下し文: write one `[n]` per 句.
