### Added

- Editor app: **File ▾ → Export ▸ → Make a video (MP4)…** (backlog #131). A short dialog says videos are made in Google Colab, asks you to upload this lesson's file (`<name>.ega.html`) there,
  and that the Egatari file plays without making a video. **Open Colab** opens the video notebook (`colab/egatari-video.ipynb`) in a new tab; with unsaved changes the button is **Save and open Colab**,
  in a working folder not exported yet **Save as Egatari file and open Colab** (save or export first, then open). If steps need their audio updated, one line gives the count.
  When the new tab is blocked, a link to the notebook
- `colabVideoUrl()` and `COLAB.videoNotebook` (`kit/core/colab-core.mjs`)
