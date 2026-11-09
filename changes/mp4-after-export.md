### Fixed

- Editor: after exporting a working folder as an Egatari file, “Make a video (MP4)…” offered “Open Colab” only until the editor noticed its own export (the `.ega.html` saved in the working folder, or `egatari.json` with a new `docId`) and rebuilt the preview, about a second and a half later; from then on it kept asking to export again although nothing had changed. The dialog now compares the working folder with its state right after the export, so it says “Open Colab” until the author changes something, including a change the preview has not picked up yet
