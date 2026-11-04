<!-- i18n: pair=article.ja.md sha256=aef5b92253f1f131 -->
# Writing a book (article.md)

English | [日本語](article.ja.md)

A lesson can carry a **book**: long-form text (a textbook chapter, a paper) beside its slides and script. The book is written in **Egatari Text 1**, a small, frozen part of MyST Markdown defined by the [format specification §9C](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#9c-article-layer-feature-article-v1-draft) (draft). This page is Studio's short guide; the specification is the normative text.

> Work in progress (v0.6.5). Studio reads, checks and renders the book as a separate page, formats citations, puts the book into the Egatari file (.ega.html) and tells you when linked slides and sections may no longer match. The player shows it beside the slides or alone ([Slides and book](reference.md#slides-and-book)), and the editor app edits and prints it ([editor](editor.md)).

## Files in the working folder

| File | What it is |
|---|---|
| `article.md` | the book as one file (a paper, or one chapter of a course) |
| `article/<name>.md` | a book of several chapters, one file each. The reading order is `article.chapters` in `egatari.json` when it is there; otherwise prefaces, chapters, appendices, afterwords, each group in file-name order (e.g. `00-preface.md`, `01.md`, `02.md`, `90-answers.md`), and `npm run ids` writes that order into an existing `egatari.json`. Use either `article.md` or `article/`, not both |
| `references.json` | the bibliography (CSL-JSON, as Zotero, pandoc and Crossref write it), one for all chapters |
| `images/…` | images used by the book, as paths inside the working folder (no URLs) |

`node kit/build.mjs <deck.html>` also writes the book as `out/deck.article.html` (one page that needs no script) and lists any problems; `node kit/check.mjs <deck.html>` checks it with the slides (section M; codes `article…` in `--json`). See [tools/fixtures/article-book](../tools/fixtures/article-book/) for a small example.

## Front matter

A file may begin with these members only:

```markdown
---
title: Mean and median
chapter: 1
---
```

| Member | Meaning |
|---|---|
| `title`, `subtitle` | the chapter's title (a chapter file must have one); the book's title is the lesson's title |
| `chapter` | the chapter number (a positive integer); chapter numbers increase in reading order and need not start at 1 |
| `kind` | `preface`, `chapter` (default), `appendix` or `afterword`. Files come in that order. Prefaces and afterwords have no section numbers; appendices are lettered A, B, … and take no `chapter` |
| `numbering` | `false` turns off this file's section numbers (figures and equations stay numbered) |
| `writing-mode` | `vertical-rl` for vertical writing (Japanese language arts); tables are vertical too (each row becomes a column, the first row on the right, a row's cells top to bottom; 1–2 digit numbers in cells stand upright) and set from the top of the line: the table, its caption and body cells start at the top, header cells and a first column of bold labels are centred in their cells. Figures, equations and code stay horizontal; the page opens at its start (the right edge). A full-width space (U+3000) at the start of a paragraph stays, so paragraphs indented as in Aozora Bunko keep their indent |
| `lang`, `bibliography` | when given, equal to the lesson's language and to `references.json`; the same in every chapter |

## What you can write

Everything from CommonMark (paragraphs, `##`–`####` headings, emphasis, lists, quotes, code, links, images), plus:

| Construct | Write |
|---|---|
| Section id | nothing: `npm run ids -- <working folder>` adds a `(sec-xxxxxx)=` line before every `##` heading that has none. Do not write or change them by hand |
| Math | `$x^2$`; display `$$ … $$`, numbered when labelled: `$$ … $$ (eq-loss)` |
| Figure | `:::{figure} images/tree.png` with `:label: fig-tree` and `:alt: description`; the first paragraph is the caption, the rest the legend |
| Subfigures | `::::{figure}` holding two or more `:::{figure} <path>` (each with `:alt:`) |
| Table | a pipe table, or `:::{table} Caption` with `:label: tbl-…` and `:class: …` around it (`:class: horizontal` keeps the table horizontal in a vertical book, for long numbers or Latin text; other names, lowercase letters, digits and `-`, go to the theme as `egatari-table-<name>`); paragraphs after the table are its notes. For merged cells, an HTML `<table>` inside `:::{table}` (only `table thead tbody tr th td`, `colspan rowspan align`, and `em strong code sub sup br` in cells; no blank lines, math or Markdown) |
| Box (aside) | `:::{aside} Title` with optional `:label: box-…` and `:class: goals` (kinds such as `goals`, `inquiry`, `tryit`, `point`, `summary`, `advanced`, `note`, `warning`) |
| Theorem-like | `:::{prf:theorem} Title` with `:label: thm-…`; also `lemma`, `definition`, `example`, `remark`, `proof` and the other kinds of mystmd. A proof ends with ∎ |
| Exercise, solution | `:::{exercise} Title` (`:label: exr-…`, `:nonumber:`); `:::{solution} exr-…` |
| Cross-reference | `[](#fig-tree)` shows "Figure 1.1", "1.2 節", "式 (1.1)"; `[text](#label)` keeps your text |
| Citation | `[@key]`, `[@key, p. 3]`, `[@a; @b]`, or `@key` in a sentence |
| Step link | ``{step}`s-k3f9q2:2` `` or ``{step}`watch this <s-k3f9q2:2>` `` (a slide id and a step) |
| Footnote | `text[^n]` and a line `[^n]: note` (paragraphs only) |
| Ruby | ``{ruby}`下人|げにん` `` |
| Sub/superscript | ``H{sub}`2`O``, ``m{sup}`2` `` |
| Definition list, glossary | `term` then `: description`; one `:::{glossary}` per book, terms used with ``{term}`term` `` |

Labels are your own readable names (`fig-…`, `tbl-…`, `eq-…`, `box-…`, `exr-…`, `thm-…`), unique across all chapters and different from slide ids; they may not start with `sec-`, `s-`, `ref-`, `fn-`, `term-` or `egatari-`.

Every figure, `:::{table}`, box, theorem-like block and exercise is numbered, with or without a label (as mystmd does); equations only when labelled; a bare pipe table has no number. Numbers follow the chapter: sections 4.1, figures "Figure 4.1" / 「図 4.1」, equations (4.1), boxes, exercises and each theorem kind counted separately; without a chapter number they run through the book (1, 1.1, Figure 1). In a Japanese book, emphasis is set with emphasis dots instead of italics, and in vertical writing a number of one or two digits stands upright (第3章, 10月), while 3.14, 2026, 12:30 and A4 are rotated whole.

### Subfigures

The outer figure has one more colon than the figures inside it. Its `:label:` and its caption (the paragraphs after the inner figures) belong to the whole figure; each small figure has its `:alt:` and may have a `:label:` and a short caption.

```markdown
::::{figure}
:label: fig-loss-pair

:::{figure} images/abs.svg
:label: fig-abs
:alt: The absolute loss is a broken line

Absolute
:::

:::{figure} images/square.svg
:alt: The squared loss is a parabola

Squared
:::

Two losses.

Made-up data.
::::
```

`[](#fig-loss-pair)` shows "Figure 1.1" and `[](#fig-abs)` "Figure 1.1(a)". The first paragraph after the inner figures is the caption, the rest the legend.

## Not allowed

Raw HTML (other than the table above), other directives and roles (admonitions such as `{note}`, `{margin}`, `{list-table}`, `{numref}`, `{eq}`, `{cite:p}`, `{math}`, …), directives fenced with backticks, `%` comments, `+++`, `{{ … }}`, strikethrough, task lists, bare URLs and `#` / `#####` headings. The check names each one with its line and says what to write instead (for example `{numref}`fig-a`` → `[](#fig-a)`, `{note}` → `:::{aside} Title`). Write `\%` and `\@` when you mean the characters.

## Citations

Cite with `[@key]`, `[@key, p. 3]`, `[@a; @b]`, or `@key` in a sentence; keys are the `id`s of `references.json`. The build formats them with the Citation Style Language (citeproc-js) and writes the reference list. Choose the style and where the list goes in `egatari.json`:

```json
{ "metadata": { "citations": { "style": "ieee", "list": "chapter" } } }
```

| Member | Values |
|---|---|
| `style` | `apa` (author–date, the default), `ieee` (numeric), `sist02` (numeric, Japanese; in a Japanese book volume, issue and pages are written vol., no., p. as SIST02 does and titles are quoted with 「」; an editor stands in for a missing author). Another name is kept, the book is set in `apa`, and the check warns |
| `list` | `end` (one list at the end, the default), `chapter` (a list at the end of each chapter, only with `article/` chapters), `none` |

A locator (`p. 3`, `3 頁`) is printed as you wrote it. Works in `references.json` that are never cited are not listed, and the check warns about them.

### Citations and licences

Citations are formatted by [citeproc-js](https://github.com/Juris-M/citeproc-js), used under the CPAL-1.0. It runs when you build or pack on your computer, and in the editor app when it shows or saves a book that cites references (the app loads the unmodified citeproc file only then); lessons and Egatari files carry the formatted text, not citeproc. When it formats citations, the build and `pack` print its attribution, and the editor app shows it under the book:

> Citations formatted by citeproc-js — (c) Frank Bennett — citeproc-js implements the Citation Style Language — https://citationstyles.org/

The styles and locales in `vendor/csl/` are from the Citation Style Language projects (CC BY-SA 3.0). See [NOTICE](../NOTICE).

## Links between slides and sections

A slide and a section are linked when the slide's `data-article` names the section's id, or when the section has a `{step}` link to the slide. `data-article` takes several section ids separated by spaces, most relevant first: `<section class="slide" id="s-k3f9q2" data-article="sec-h7q2xz sec-q7r2x5">`. The first one is the slide's section: **Read in the book** opens it, and the book follows the slides to it. `npm run ids -- <working folder>` records each new link in `egatari.json` (`articleLinks`: a hash of the section's text and of the slide with its script). When one side changes later, the check says “slides and book may not match” for that pair; nothing is changed automatically. Compare the two, edit what needs it, then run `npm run ids -- <working folder> --confirm-links` to record that they agree again.

## The Egatari file

`npm run portable -- pack <working folder>` (and `node kit/build.mjs <deck.html> --portable`) puts the book into the Egatari file: the chapter files, `references.json` and the book's images go into the archive, and the rendered book is the last part of the file's readable text (`#egatari-article`), so it can be read without script. A book with errors is not written; fix what the check lists first. Sections without an id get one, written back to the working folder. `unpack` gives back the same files and the reading order in `egatari.json`. The editor app shows, checks, edits and prints the book ([Editor app](editor.md#book-draft)); when only the book changed it saves an Egatari file by rebuilding the book alone, and it exports a working folder that has one.
