### Added

- 肩見出し / kicker: an optional short line above a slide's heading, `<p class="kicker">` just before the `<h2>` (backlog #195). It shows at step 0, is not part of the heading, and English is shown in capitals by the theme (type it normally). Placement and size come from `kit/layouts.css` and the theme tokens `--kicker-size` (24px), `--kicker-color` and `--kicker-weight`; on a cover or chapter divider it sits below the top band. Themes default 1.5.0 and sumi 1.3.0 add the tokens; sumi shows the kicker over its heading band. Earlier theme versions are kept
- Quality check (command line and editor, through the shared `kit/core/kicker.mjs`, rule R-headings): `kickerLong` (over 24 full-width units, or 40 characters in Latin script), `kickerPlace` (more than one, or not just before the heading) and `kickerSlide` (info: on a cover, chapter divider or vertical slide). The AI instructions say how to add one in one line
- Glossary: new term kicker (肩見出し), decided 2026-11-14
