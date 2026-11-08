<!-- generated; do not edit by hand -->
# Writing a book

The rules themselves are in Studio's [docs/article.md](https://github.com/egatari/egatari-studio/blob/v0.6.7/docs/article.md) (Egatari Text 1, spec §9C). This page is the author's procedure and the places that are easy to trip on.

## 1. Decide the book's shape first

| Shape | Use when | How to write it |
|---|---|---|
| `article.md` (one file) | A reading, a paper or a single work with no chapter numbers (a Japanese-language work and its guide) | `title` in the front matter. `numbering: false` if sections need no numbers |
| `article/<name>.md` (one file per chapter) | A textbook with numbered chapters | Every chapter file needs `chapter:` (a positive integer). Preface: `kind: preface`; appendix: `kind: appendix` (no `chapter`); afterword: `kind: afterword` |

- A `kind: chapter` file in `article/` needs `chapter:`. There is not yet a way to add preface or afterword files to a book without chapter numbers. Make such a book an `article.md`, and put records such as the source edition and the typist in the last `##` section.
- The reading order is written to `article.chapters` in `egatari.json` by the build and ids tools. Do not write it by hand.
- Vertical writing: `writing-mode: vertical-rl` in the front matter. Tables are vertical too, by default. Figures, display math and code stay horizontal.

## 2. Outline

For each chapter and section: the heading, the point to convey, the figures, tables and equations (those that get numbers), the references to cite, the slides and steps to link, and the columns and exercises. Slides are needed only for the key parts of the book (not every section needs a slide).

## 3. What you can write, in brief

- Figure: `:::{figure} images/x.svg` with `:label: fig-…` and `:alt:`. The first paragraph is the caption. To put small figures side by side, put `:label:` and the caption (the last paragraph) on an outer `::::{figure}` and two or more `:::{figure}` inside it.
- Table: wrap a pipe table in `:::{table} caption` with `:label: tbl-…`. Use an HTML `<table>` only to merge cells.
- Equation: `$$ … $$ (eq-…)` gets a number. An equation without a name gets no number.
- Column: `:::{aside} title`, with `:class: goals` (aims), `point`, `advanced`, `note`, `tryit` and so on. Columns are numbered (Column 1.1). Put mathematics and terms that leave the main line in a column.
- Exercise and solution: `:::{exercise} title` with `:label: exr-…`; the solution is `:::{solution} exr-…`. Solutions may be gathered in an appendix chapter.
- Footnote: `text[^n]` and `[^n]: note`. Notes gather at the end of the `##` section. For a Japanese-language work, make the body one `##` section and the guide the next `##` section, and the word notes come right after the body.
- Ruby: ``{ruby}`下人|げにん` ``. Glossary: `:::{glossary}` (one per book) and ``{term}`term` `` in the body.
- Cross-references: `[](#fig-loss)` becomes "Figure 1.1", even across chapters. Each name (label) is used once in the whole book. Do not start one with `sec-`, `s-`, `ref-`, `fn-`, `term-` or `egatari-`.
- Do not write section ids (`(sec-…)=`). The tool adds them.
- A full-width space (U+3000) at the start of a paragraph is kept. You may use it as an indent.

## 4. Linking with the slides

- Book to slide: inside a section, ``{step}`See it on the slide <s-xxxxxx:2>` ``. The text says what happens, like "See it on the slide".
- Slide to book: `<section class="slide" data-article="sec-a sec-b">` (any number of section ids separated by spaces).
- Both need ids, so write the links after the ids are added (the procedure in the studio skill).
- A section with no slide (an opening scene, the source record) gets a warning, and that is fine.

## 5. Citations

- References go in `references.json` (CSL-JSON). In the body: `[@key]`, `[@key, p. 3]`, `[@a; @b]`, and `@key` within a sentence.
- The style is `metadata.citations` in `egatari.json`: `{"style": "sist02", "list": "end"}` (Japanese-language books), `apa` or `ieee`. `list` is `end` (one list at the end) or `chapter` (per chapter).
- For an edited book, `editor` alone may not show a name. Write `author: [{"literal": "Edited by ○○"}]`.
- Write bibliographic details only after checking the publisher's or institution's page, or the book itself. Do not cite what you cannot verify. For web sources give the URL and the date seen (`accessed`).

## 6. Soundness of the content

- Numbers come only from the output (`data/*.json`) of a verified script (`scripts/`, run with uv). Take official statistics from the primary source (PDF, table), with the year and the definition (for example, whether households with zero savings are included).
- The text of a work stays exactly as in its source (Aozora Bunko and so on). Check the import and the quotations against the original characters with a script (and record how ruby and unusual characters were handled). The source edition, typist and proofreader follow the source's own record.
- Fictional data is marked "fictional" in the body, in each figure and in each table. Do not include learners' data.
- Ask the user to look over anything the author must judge, such as the interpretation of a work or the meaning of a phrase.

## 7. Vertical books

- Numbers of one or two digits become upright-in-line (tate-chu-yoko) automatically. Write years with four digits (2026, 1917).
- Tables are vertical by default, like the text. Write the table in its original order (do not reverse rows or columns).
- A table of long numbers or Latin text: write it as `:::{table} caption` with `:class: horizontal`, and it stays horizontal.
- A table whose first column labels the rows: add `:class: row-headers`. Do not make the labels bold.
- Figures, display math and code stay horizontal.
- Footnote numbers stay upright (they are not turned sideways).
- Keep one column of a vertical slide (`layout-tate`) to about 17 characters (do not make a second column of one character).

## 8. Figures

- The book's figures are matplotlib SVGs (`images/`). The theme's colour variables do not apply, so use calm fixed colours (grey, navy and so on) and do not rely on colour alone for meaning (distinguish by line shape and labels).
- Moving figures are slide parts. Make the book's figures and the slides' figures from the numbers of the same script.
