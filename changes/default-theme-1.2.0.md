### Changed

- Theme `default` 1.2.0, the conclusion row: a 5px bar in `--emph` on its left, bold text, its fixed position and a light grey ground (`--concl-bg` transparent → #F5F5F5), left-aligned instead of centred in a frame. Position and height are unchanged (571px / 72px), so the quality checks give the same results.
  `--emph` text on the ground is 5.32:1 and `--fg` 14.59:1; the neutral grey looks the same for every colour-vision type and in greyscale. Vertical (`layout-tate`) slides keep the framed conclusion column. `kokugo` takes the bar in its own red; `business` keeps its pale-orange ground. A lesson that recorded `default` 1.1.0 keeps it (`theme pinned: …`, `--update-themes`). Conclusion row design proposed by @totasuko-lab
