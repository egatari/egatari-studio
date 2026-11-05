### Added

- Editor, AI instructions on the paid plan: wherever the instruction pack can be copied in full (New… step 4, and Insert slides step 2
  once "Send to a different chat" is ticked), **Save the instructions as a file** is the primary button and **Copy the instructions**
  the secondary one, with a line under them about attaching long instructions instead of pasting them (Gemini cuts a paste at about
  30,000 characters; ChatGPT turns a long paste into an attachment by itself; owner's test, 2026-11-05). It downloads
  `egatari-instructions-ja.txt` / `egatari-instructions-en.txt` (by the pack's language), the exact bytes the copy would put on the
  clipboard (UTF-8, no BOM). The free plan is unchanged: copying stays the only, primary action
- Tests: a CI guard next to the existing pack size checks keeps the free pack (standard parts, no set — the largest combination the
  editor can produce on the free plan), ja and en, under 31,000 UTF-16 code units, a margin under Gemini's ~32,768-character paste
  limit (the free plan has no file-save fallback). The English pack already measures close to this margin (~30.5K) as the parts
  catalogue has grown; worth watching if it keeps growing

### Changed

- The paid-plan instruction pack cap (`PAID_PACK_KB` in `kit/core/llm-pack-assemble.mjs`) is raised from 120 KB to 150 KB; the free
  target stays 45 KB
