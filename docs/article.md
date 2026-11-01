<!-- i18n: pair=article.ja.md sha256=b5245e3217795d3a -->
# Writing a book (article.md)

English | [日本語](article.ja.md)

A lesson can carry a **book**: long-form text (a textbook chapter, a paper) beside its slides and script. The book is written in **Egatari Text 1**, a small, frozen part of MyST Markdown defined by the [format specification §9C](https://github.com/egatari/egatari-spec/blob/main/egatari-1.0.md#9c-article-layer-feature-article-v1-draft) (draft). This page is Studio's short guide; the specification is the normative text.

> Work in progress (v0.6.5). Studio reads, checks and renders the book as a separate page. Not yet: showing it in the player beside the slides, formatted citations and reference lists, putting it into the Egatari file (.ega.html), and links between slides and sections with staleness.

## Files in the working folder

| File | What it is |
|---|---|
| `article.md` | the book as one file (a paper, or one chapter of a course) |
| `article/<name>.md` | a book of several chapters, one file each, read in the order of their names (e.g. `00-preface.md`, `01.md`, `02.md`, `90-answers.md`). Use either `article.md` or `article/`, not both |
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
| `writing-mode` | `vertical-rl` for vertical writing (Japanese language arts); figures, tables and equations stay horizontal |
| `lang`, `bibliography` | when given, equal to the lesson's language and to `references.json`; the same in every chapter |

## What you can write

Everything from CommonMark (paragraphs, `##`–`####` headings, emphasis, lists, quotes, code, links, images), plus:

| Construct | Write |
|---|---|
| Section id | nothing: `npm run ids -- <working folder>` adds a `(sec-xxxxxx)=` line before every `##` heading that has none. Do not write or change them by hand |
| Math | `$x^2$`; display `$$ … $$`, numbered when labelled: `$$ … $$ (eq-loss)` |
| Figure | `:::{figure} images/tree.png` with `:label: fig-tree` and `:alt: description`; the first paragraph is the caption, the rest the legend |
| Subfigures | `::::{figure}` holding two or more `:::{figure} <path>` (each with `:alt:`) |
| Table | a pipe table, or `:::{table} Caption` with `:label: tbl-…` around it; paragraphs after the table are its notes. For merged cells, an HTML `<table>` inside `:::{table}` (only `table thead tbody tr th td`, `colspan rowspan align`, and `em strong code sub sup br` in cells; no blank lines, math or Markdown) |
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

Numbers follow the chapter: sections 4.1, figures "Figure 4.1" / 「図 4.1」, equations (4.1), boxes, exercises and each theorem kind counted separately; without a chapter number they run through the book (1, 1.1, Figure 1). In a Japanese book, emphasis is set with emphasis dots instead of italics, and in vertical writing one- and two-digit numbers stand upright.

## Not allowed

Raw HTML (other than the table above), other directives and roles (admonitions such as `{note}`, `{margin}`, `{list-table}`, `{numref}`, `{eq}`, `{cite:p}`, `{math}`, …), directives fenced with backticks, `%` comments, `+++`, `{{ … }}`, strikethrough, task lists, bare URLs and `#` / `#####` headings. The check names each one with its line and says what to write instead (for example `{numref}`fig-a`` → `[](#fig-a)`, `{note}` → `:::{aside} Title`). Write `\%` and `\@` when you mean the characters.
