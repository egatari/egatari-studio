### Added

- Editor, AI instructions on the paid plan: wherever the instruction pack can be copied in full (New… step 4, and Insert slides step 2
  once "Send to a different chat" is ticked), **Save the instructions as a file** is the primary button and **Copy the instructions**
  the secondary one, with a line under them about attaching long instructions instead of pasting them (Gemini cuts a paste at about
  30,000 characters; ChatGPT turns a long paste into an attachment by itself; owner's test, 2026-11-05). It downloads
  `egatari-instructions-ja.txt` / `egatari-instructions-en.txt` (by the pack's language), the exact bytes the copy would put on the
  clipboard (UTF-8, no BOM). The free plan is unchanged: copying stays the only, primary action
- Tests: a CI guard next to the existing pack size checks keeps every free pack, ja and en, at most 31,000 counting UTF-16 code units
  plus one more per line feed (a paste may arrive with CRLF): the standard pack as assembled, and the fitted pack of every combination
  of part sets New… can tick (`tools/test-new-deck.mjs`). Gemini cut the owner's paste at about 32,173 units, and the free plan has no
  file to fall back on, so this leaves room for the brief

### Changed

- The paid-plan instruction pack cap (`PAID_PACK_KB` in `kit/core/llm-pack-assemble.mjs`) is raised from 120 KB to 150 KB
- The free plan's instruction limit is now 45 KB **and** a paste length of 31,000 (UTF-16 code units plus line feeds;
  `FREE_PASTE_UNITS` and `fitSize` in `kit/core/llm-pack-assemble.mjs`), whichever is reached first, for every free pack: New… step 4
  (the meter, the shortening of the core four and the parts suggested for unticking) and `node kit/llm-pack.mjs` fit to it with the
  same steps as before (shorten the core four first). English is about one byte per character, so before this every English free
  pack with a part set was over 31,000 (31,857–38,520) and Gemini cut it when pasted. Now each English pack with a set has the core
  four shortened; the English standard pack (30,525) is unchanged. Japanese packs (22,000–27,000) and every paid pack are byte for
  byte the same
- Free plan, one part set ticked and still over the limit after shortening the core four: the parts left out are now the standard
  parts outside the core four, in a fixed order (`m-fishbone`, `m-quad`, `m-cycle`, `m-venn`, `m-tree`, `m-timeline`, `m-compare`,
  `m-pie`, `m-scatter`, `m-curves`; charts last, since the subject sets lean on them; `SINGLE_SET_DROP_ORDER`), stopping as soon as
  it fits. The set's own parts and the core four are never left out. In English, stats leaves out `m-fishbone` to `m-timeline` (six
  parts), math the same and `m-compare`, `m-pie`, kokugo `m-fishbone`, `m-quad`. With two or more sets nothing changes: specialized
  parts are left out, largest first. `node kit/llm-pack.mjs` names every part it left out on stderr; New… names them as the parts to
  untick The
  size table in `docs/authoring-with-llms.md` shows the paste length of each free pack, and `--list` shows it too
