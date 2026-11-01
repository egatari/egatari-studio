# Egatari Text 1 fixtures (§9C.2)

Conformance fixtures for **Egatari Text 1**, the frozen MyST subset in which article files are written (§9C.2–§9C.4). All content is fictional.

## Layout

```
valid/<case>/input.md         an Egatari Text document (front matter optional)
valid/<case>/expected.json    the parser's mdast tree for input.md
invalid/<case>/input.md       a document that breaks Egatari Text 1
invalid/<case>/expect.json    {"error": "<short reason>", "spec": "§9C.x"}
FINDINGS.md                   where the parser's tree differs from the node types in §9C.2
```

## How the expected trees were made

- Tools: `myst-parser` **1.7.5**, function `mystParse` with its default options plus the proof directive of `myst-ext-proof` **1.0.13** and the exercise directives of `myst-ext-exercise` **1.0.10** (the extensions mystmd uses), then six transforms of `myst-transforms` **1.3.52** in this order: `liftMystDirectivesAndRolesTransform`, `mystTargetsTransform`, `reconstructHtmlTransform`, `htmlTransform`, `containerChildrenTransform`, `captionParagraphTransform` (exact versions pinned in `package.json`). These are the structural steps of §9C.2; numbering and resolution are not run.
- The YAML front matter block (`---` … `---` at the start of the file) is read off before parsing; only the rest of the file is passed to `mystParse`. (Given the whole file, myst-parser 1.7.5 returns the front matter as a `code` node with `lang: "yaml"`.) The front matter is therefore not part of `expected.json`; its members are checked by validators against §9C.2.
- Every `position`, `key` and `html_id` key is removed. Nothing else is changed; no tree was written by hand.
- `npm test` (`tools/test-fixtures.mjs`) re-parses every `valid/*/input.md` the same way and deep-compares the result with `expected.json`. After a deliberate change to an input, regenerate with `node tools/test-fixtures.mjs --update-article-text` and review the diff.

## Trees are before resolution

`expected.json` is the tree after the four structural transforms above, before resolution and numbering. Where §9C.2 says a node is "resolved to" something, the fixture shows the unresolved node:

- a link whose URL starts with `#` stays a `link` (it becomes `crossReference` only when a producer resolves it);
- a step link stays `mystRole` with `name: "step"` and the raw `value` (it becomes `egatariStep` with `slideKey`, `stepKey` and children only when resolved); a ruby role likewise stays `mystRole` with `name: "ruby"` (it becomes `egatariRuby`);
- a `proof` node carries `enumerated: true` as the parser gives it, also for `kind: "proof"`, which producers do not number (§9C.1A);
- no numbers are present (§9C.6: numbering is the producer's).

A `(label)=` line has already been attached to the next node (`label`, `identifier`), and figures and wrapped tables are `container` nodes with `caption` (and `legend`), as §9C.2 lists.

A conforming parser written without MyST's tools should produce these trees; resolution (§9C.6) is checked separately. The differences between these trees and the node types listed in §9C.2 are recorded in [FINDINGS.md](FINDINGS.md).

## Valid cases

| Case | Construct (§9C.2 row) |
|---|---|
| `paragraph-breaks` | paragraphs, soft breaks, hard breaks (backslash and two spaces) |
| `heading-atx` | ATX headings, levels 2–4, with a section target |
| `heading-setext` | setext level-2 heading after a target |
| `target-heading-level3` | target before a level-3 heading |
| `emphasis-strong-code` | emphasis, strong, code span |
| `list-ordered-start` | ordered list starting at 3 |
| `list-bullet` | bullet list with a blank line between items |
| `blockquote` | block quote (Japanese) |
| `thematic-break` | `***` and `---` |
| `code-fenced`, `code-tilde`, `code-indented` | code blocks |
| `link-inline` | inline link with title; `<url>` autolink |
| `link-reference` | reference link and definition |
| `image-inline` | inline image with an archive path |
| `math-inline` | inline math |
| `math-display-label-closing` | display math with `(eq-…)` on the closing line |
| `math-display-target` | display math after a `(eq-…)=` line |
| `figure` | `:::{figure}` with `:label:`, `:alt:`, caption and legend |
| `table-plain` | GFM pipe table with alignment |
| `table-wrapped` | pipe table in `:::{table}` with caption and `:label:` (Japanese) |
| `crossref-empty`, `crossref-text` | cross-references with empty and given text |
| `cite-single` | `[@key]` |
| `cite-grouped-locator` | `[@a; @b, p. 3]` |
| `cite-locator-japanese` | `[@key, 3 頁]` |
| `step-link-bare`, `step-link-text` | both step link forms |
| `escapes` | `\$`, `\@`, `\%` (including at the start of a line), `\[` |
| `frontmatter-chapter` | front matter `chapter: 4`, a figure and a cross-reference (Japanese) |
| `frontmatter-numbering-false` | front matter `numbering: false` |
| `japanese-vertical` | front matter `writing-mode: vertical-rl`, Japanese text |
| `aside` | `:::{aside}` with a title, `:label:`, math and two paragraphs (Japanese) |
| `proof-theorem` | `:::{prf:theorem}` with a title and label, then `:::{prf:proof}` |
| `proof-kinds` | `definition` with a title, `lemma` without one, `remark` without a label |
| `footnote` | `[^1]` and its definition |
| `table-legend` | `:::{table}` with a pipe table and a two-paragraph legend |
| `table-html-spans` | HTML table in `:::{table}`: `rowspan`, `colspan`, `align`, `strong`, `em`, `sub`, `br`, and a legend |
| `ruby` | two `{ruby}` roles in a sentence |
| `frontmatter-kind-appendix` | front matter `kind: appendix` with a labelled equation and a cross-reference |
| `frontmatter-kind-preface` | front matter `kind: preface` |
| `aside-class` | asides with `:class: inquiry` and `:class: goals` |
| `exercise-solution` | exercise with title and label, its solution, an exercise with `:nonumber:` |
| `subfigure` | a figure holding two subfigures, with caption and legend |
| `cite-narrative` | `@key` in running text |
| `sub-sup` | `{sub}` and `{sup}` |
| `definition-list` | a definition list |
| `glossary-term` | `{term}` in both forms and a glossary |
| `proof-algorithm` | `prf:algorithm` and `prf:assumption` |

## Invalid cases

These are for producers' validators (§9C.2: a producer MUST reject a construct outside the subset, or convert it and tell the author). They are listed, not parsed: `npm test` checks only that each folder has `input.md` and a well-formed `expect.json`. Note that myst-parser 1.7.5 with default options does not itself flag them; some (`bare-url-autolink`, `strikethrough`) come out as plain text, so a validator needs its own checks.

| Case | Reason | Spec |
|---|---|---|
| `raw-html-block`, `raw-html-inline` | raw HTML | §9C.2 |
| `admonition` | admonition directive | §9C.2 |
| `role-numref` | `{numref}` role | §9C.2 |
| `list-table` | `{list-table}` directive | §9C.2 |
| `comment` | `%` comment | §9C.2 |
| `block-break` | `+++` | §9C.2 |
| `substitution` | `{{ … }}` | §9C.2 |
| `bare-url-autolink` | bare URL | §9C.2 |
| `strikethrough` | `~~…~~` | §9C.2 |
| `task-list` | `- [ ]` | §9C.2 |
| `heading-level-1`, `heading-level-5` | heading level outside 2–4 | §9C.2 |
| `frontmatter-unknown-member` | front matter member `author` | §9C.2 |
| `figure-label-sec-prefix` | figure label starting with `sec-` | §9C.3 |
| `citation-key-pattern` | key `doe..1948` breaks the key pattern | §9C.4 |
| `image-http-url` | image path is an `https:` URL | §9C.1 |
| `aside-no-title`, `aside-nested` | aside without a title; aside inside an aside | §9C.2 |
| `proof-kind-unknown`, `proof-colon-name` | `prf:algorithm`; the spelling `proof:theorem` | §9C.2 |
| `footnote-with-table` | footnote definition holding a table | §9C.2 |
| `ruby-no-separator` | ruby role without `\|` and a reading | §9C.2 |
| `html-table-outside-container` | HTML table not inside `:::{table}` | §9C.2 |
| `html-table-attribute` | `style` on a cell | §9C.2 |
| `html-table-blank-line` | blank lines inside the HTML table (Markdown in a cell) | §9C.2 |
| `html-table-math` | `$…$` in an HTML table cell | §9C.2 |
| `frontmatter-kind-unknown` | `kind: index` | §9C.2 |
| `frontmatter-appendix-chapter` | `chapter` on an appendix | §9C.1A |
| `aside-class-pattern` | class `Inquiry_Box` | §9C.2 |
| `exercise-hidden` | option `:hidden:` | §9C.2 |
| `subfigure-images-in-paragraph` | two images in one paragraph of a figure (their alt text would become captions) | §9C.2 |
| `solution-unknown-exercise` | solution for a label that does not exist | §9C.8 |
| `term-unknown` | `{term}` not in the glossary | §9C.8 |
| `cite-narrative-locator` | `@key, p. 3` | §9C.4 |
