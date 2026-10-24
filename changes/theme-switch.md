### Added

- Editor app: **Slide ▾ → Change theme…** changes the theme of an open deck. It lists the themes of New… ③ (display names, color swatches, the current one marked, and Load another theme…), rewrites only `data-theme` on the source's `<html>` (other attributes such as `data-egatari-seed` and the slides stay), pins the new theme at its current version in `egatari.json` `themes` and drops pins nothing uses (other members keep their bytes).
  The preview is rebuilt; it is an unsaved change and **Undo** in the slide list restores the source and `egatari.json` byte for byte. Disabled, with the reason, in files where only narration, audio and timing can be edited.
