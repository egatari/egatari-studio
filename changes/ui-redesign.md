### Changed

- Editor app, toolbar (UI redesign, stage 1): four items, **File ▾**, **Slide ▾**, **Quality check** and **Preview ▾**, using the usual menu terms of other apps. File ▾ has New…, Open…, Save, Save as…, Export ▸ (For participants (play only)…, Print / PDF, and Export working folder… for a single file), File info… and Work in a folder…; Theme folder moves to “Load another theme…” at the end of the theme list in New…. Slide ▾ has Insert slide… (from a template or a chat AI), Duplicate, Delete (the slide selected in the slide list, or the one on screen) and Revise…. Preview ▾ has the display modes Check as a slide show (f, also full screen), Check as a lecture and Check as a video, and Check in presenter view (p), with the note that you present from the saved `.ega.html`. Edit, Script, Notes and Audio stay as a temporary group until they become right-panel tabs. The toolbar still fits one row at 1280 px.
- Editor app: the menus follow the ARIA menu-button pattern (↑ ↓ wrap, Home / End, letters, → / ← for Export ▸, Esc returns focus to the button, Tab closes). Keys are not sent to the preview, and `e` / `n` / `c` do not toggle the panels, while a menu or a dialog is open.
- Editor app: **Quality check** runs by itself about 1 s after each build and preview load (debounced, skipped while a build is pending) and its badge shows the errors and warnings it found, in the error colour when there are errors; build and save warnings are listed at the top of its panel (the separate Warnings button is gone).
- Editor app: **Save as…** replaces “Save as new lesson…” and “Save a copy…” (a checkbox “Save as a new file (it becomes separate from the original)” gives the new docId); in a working folder it writes the Egatari file (editable, `.ega.html`). Save is shown in a working folder too and explains that the folder is saved as you edit.
- Editor app: **For participants (play only)…** asks in a dialog with an “Add Live (questions and polls)” checkbox; ticking it shows the Live settings in the same dialog, replacing “Distribute with Live…”. A Live export gets a mark on the title side of the file name, such as `題名（ライブ 10-30）.play.ega.html` (the day the Live starts); the extension is unchanged. Importing Live results is in File info… (attachments).
- Editor app: **File info…** shows the title, license, creators, copyright and attribution of the lesson (read only), the format (`version`, with the spec snapshot from `vendor/egatari-spec/SOURCE.json` when present) and the Studio version that made the file (`generator.version`; “This Studio” for a working folder), with a note that playback uses the player inside the file, above the attachments, which move there from the toolbar.

- Editor app, **New…** is the chat-AI way only, in five steps: subjects (parts; optional, none ticked), design (theme, by display name: Standard, Business, Kokugo, and user themes by their `theme.json` title or name; added to the request and given to a reply without one), what you want, copy, paste. The first screen is New… (with the 「…」 icon draft), Open, Recent files, Samples, a small “Make it with Claude Code or Cowork (advanced)” link and Work in a folder…; the table of file kinds moved to the help.
- Editor app, wording: Export (エクスポート), File info (ファイルの情報), Template (テンプレート), Samples (サンプル), Subjects (parts) (分野（使うパーツ）), Script (台本).

### Removed

- Editor app: Blank and From a template in New… (slide templates stay in Insert slide…; `npm run new` makes a new working folder).

- Editor app: “Export built HTML” (the built `out/deck.html` is still made by `node kit/build.mjs`).

### Fixed

- Editor app, New…: the sizes use one measure (UTF-8 bytes / 1024 of the copied parts), so the total is no longer smaller than the common body.
