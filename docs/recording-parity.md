# Recording: one way (backlog #82) — parity of the removed panel recording

The Audio panel used to record by itself (**● Record** / **■ Stop**, with its own meter at the bottom of the panel). Since #82 the panel's **● Record (r)** opens [recording mode](editor.md#recording-mode-keyboard-only) at the panel's step, and recording mode is the only way to record. The panel stays open behind recording mode, so one take is **Space → speak → Space → Esc**, and the panel then shows the new take for the step.

Before the panel recording was removed, everything it did was listed and checked against recording mode. The rows marked **added** are what recording mode did not do before.

| Panel recording did | Recording mode | Checked by |
|---|---|---|
| Opened the microphone in the editor page only, echo cancellation, noise suppression and automatic gain off, mono | Same constraints (`openMic` in `app/rec-mode.js`); the microphone stays open until the screen closes | `tools/test-recording.mjs` |
| Microphone refused: a message with how to allow it | Same text in the alert region and on the screen (`#rec-err`); the screen goes back to waiting | `tools/test-audio.mjs` (“mic error”) |
| `MediaRecorder` could not be created: uncaught | **added:** reported on the screen and in the alert region, back to waiting, nothing written | `tools/test-audio.mjs` (“recorder error”) |
| Level meter and elapsed time, appended at the bottom of the panel (below AI voice, Colab and the voices, out of sight) | Meter and time beside the large script; `prefers-reduced-motion` updates it a few times a second | `tools/test-audio.mjs`, `tools/test-recording.mjs` |
| Stopped at 600 s (`AUDIO_LIMITS.maxSeconds`) and used the take | Same; **added:** a timer also stops it when the meter is not drawn (background tab), and the screen says why it stopped (`#rec-limit`, alert region) | `tools/test-audio.mjs` (“limit”, shortened through `__APP_TEST.recMaxSeconds`) |
| Post-processing (`processTake`: trim, −20 LUFS, mono 44.1 kHz); an empty take is an error | Same function and error; a 0.15 s tail after the stop key | `tools/test-recording.mjs` |
| Gain: the gain applied shown on unused takes (no input-gain control; automatic gain off) | The gain applied is shown with every take; unused takes in the panel still show it | `tools/test-audio.mjs` (“gain”, “unused take”) |
| Clipping: the peak was measured but no warning was shown | Warning on the screen (`#rec-clip`) and in the announcement | `tools/test-audio.mjs` (“clipping”) |
| `inputHash` of the current script at the time of the take | Same (`panel.commit` → `currentHash`) | `tools/test-audio.mjs`, `tools/test-recording.mjs` |
| Manifest bookkeeping: MP3 (or WAV), `rec_<hash>` name, `kind: "recorded"`, `sync: "none"`, `processing`, `startOffset`, script order, refused if the manifest changed since it was read | Same write path (`useTake` / `writeEntry`); with C presses `sync: "manual"` and cues | `tools/test-audio.mjs`, `tools/test-recording.mjs` |
| Backup of `audio/manifest.json` to `.cache/edits/` before each write | Same | `tools/test-audio.mjs` |
| Undo: **↶ Revert to previous** (20 per step, in memory) | Same history; Backspace reverts a take of this mode; the panel's button after Esc | `tools/test-audio.mjs`, `tools/test-recording.mjs` |
| A take that cannot be written stays under **Audio not used yet** with **Use this take** | Same list; the screen says it was not written and where to use it; after Esc the panel shows it | `tools/test-audio.mjs` (“unused take”) |
| Editing prompt (“Edit this file?”, Egatari file) and read-only refusal before writing | Same `beforeWrite` on every write; the “Edit this file?” check also runs when the screen opens | `tools/test-audio.mjs` (single file, tier A save) |
| Cancelled when another lesson is opened (workspace / generation) | Same checks; a take in progress is discarded and the screen resets (closed, idle, microphone released) | `tools/test-audio.mjs` (“workspace change”: the folder is opened again during a take) |
| Preview inert while recording; hints from the preview cannot start a recording | Preview and toolbar inert while the screen is open; a hint can only open it | `tools/test-audio.mjs`, `tools/test-recording.mjs` |
| Stayed on its step while recording | The screen owns the step; the panel, hidden behind it, follows the takes | `tools/test-audio.mjs` |
| Toast “used audio/…”; an Egatari file becomes unsaved | Same | `tools/test-audio.mjs` |
| Closing the panel during a take threw it away | Esc during a take throws it away, nothing is written | `tools/test-recording.mjs` |
| Leaving the page during a take asked first | Same (`rec.isBusy()` in `beforeunload`) | — |
| Keyboard: only the button | Space, Enter, Backspace, ← →, C, Esc, each also a button with `aria-keyshortcuts`; the panel's button has `aria-keyshortcuts="r"` and `aria-haspopup="dialog"`, and focus returns to it after Esc | `tools/test-audio.mjs`, `tools/test-recording.mjs` |
| Screen readers: no announcements | Modal dialog, live region (step, recording, timing presses, result) and alert region | `tools/test-recording.mjs` |
| Script with Expert / Novice labels, taller while recording | Script in large type with the labels and the timing chips | `tools/test-audio.mjs` (“dialogue”), `tools/test-recording.mjs` |
| Button said **● Record again** on a recorded step | Dropped: the button is always **● Record (r)** | — |
