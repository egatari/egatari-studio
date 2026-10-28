### Changed

- A file exported from a working folder now says what it is, in plain words: "This file was exported from a working folder (the folder that holds the slide and script files). Editing it here does not change the files in that folder. If you don't have the folder, you can edit and save this file as usual." It is shown as an ordinary information line, not a warning, and the button keeps its menu name, "Export working folder…". After an edit the line adds "This file has been edited since it was exported." (ja: 「作業フォルダから書き出したファイル」). `docs/terms.json` follows the glossary (2026-10-29, 103 terms): drag-and-drop, exported-file, no-upload.
- Start screen: the drop area reads "Drag a .ega.html file here" (ja: 「.ega.html ファイルをここにドラッグ＆ドロップ」). The Samples line no longer describes a second check ("Sample lessons made with Egatari. Open one to play it or edit it."). "Work in a folder…" and "My themes…" are ordinary outlined buttons, each on its own row with a one-line hint. The privacy line is shorter and says "nothing is uploaded"; the first use of AI voice downloads the voice model.

### Fixed

- The Samples (`dist/examples/` and the release assets) no longer carry the exported-from-a-folder mark, so a downloaded sample opens without that notice. `build --portable` on a working folder is unchanged and still writes the mark.
