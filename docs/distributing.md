<!-- i18n: pair=distributing.ja.md sha256=dfebe355e074e36b -->
# Handing a lesson to learners

English | [日本語](distributing.ja.md)

A lesson goes out as one HTML file: the [single file (`.ega.html`)](reference.md#single-file---portable), or for learners usually its play-only copy (`--play-only`: no source, only the slides and the audio). It plays offline in any current browser (Chrome, Edge, Safari, Firefox) once it is **downloaded and opened in the browser**. Most problems come from places that show a preview of the file instead of opening it.

| Route | What to tell learners | Notes |
|---|---|---|
| Google Drive (and Google Classroom, which shares through Drive) | “Download the file, then open it in your browser.” | The Drive preview shows HTML as text or not at all; it does not run the lesson. Share the file with the people who need it (or “anyone with the link”) |
| Email | “Save the attachment, then open it in your browser.” | Mind the size limit of the mail system (often 20–25 MB; audio makes the file larger). Some school mail filters block or strip `.html` attachments: send a `.zip` of the file, or a Drive link, instead |
| LMS (Moodle, Canvas, Classroom, …) | “Download the file, then open it.” | Upload it as a file resource and, if the LMS offers it, set the display to download. Shown inside the LMS page, scripts may be blocked and the lesson may not play |
| Your own web space (a school web server, GitHub Pages, …) | the URL | Opens directly, also on phones and tablets. Any static hosting works; nothing runs on the server |

- **Phones and tablets.** The quick preview of a file app (for example the iPhone Files app) may not run the lesson. Open the file in the browser, or give a URL. We have not yet checked every device and route; please tell us what worked for you ([feedback](https://github.com/egatari/egatari-studio/issues/new?template=feedback.yml))
- **Check before class.** Open the file you will hand out on a computer that is not yours, the way learners will (download, then open), and play one slide with audio
- **Keep the editable file.** Hand out the play-only copy and keep the single file or the working folder to edit later; a play-only copy cannot be edited
- **Audio without WebGPU.** The editor can make the narration audio in Colab on a computer without WebGPU ([Make the audio in Colab](editor.md#make-the-audio-in-colab-when-there-is-no-webgpu)). <!-- colab-verified --> Verified: 2026-10-21, Irodori, Colab T4 GPU (one run in the author's environment). Kokoro and CPU not yet. **Privacy:** in Colab the narration text is processed in Google's environment, so use it only for text you may share; the exported `tts-job.json` holds the text to read and the voice names, nothing else from the lesson.
