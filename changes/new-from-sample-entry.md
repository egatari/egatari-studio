### Added

- Editor, New…: a third entry on its first screen, next to **Paste the AI’s output**: **Make one based on this sample**
  (このサンプルを参考に作る), with “Keeps its structure, theme and parts; the content is new, from your topic.” under it. It opens a picker with
  the same samples as the first screen (**Choose** on each) and then New… from that sample, exactly as the sample window’s button does

### Changed

- `?from-sample=<name>` (the names in `examples.json`, e.g. `kokugo-kanbun`; combines with `?lang=`) with an unknown name now opens New…
  as usual with one line at the top, “Sample “…” not found. New… is open.”, instead of a notice on the first screen. The sample list is built
  into each version, so the link opens that version’s samples at the site root, inside a frozen copy (`/vX.Y.Z/`) and in the offline editor
