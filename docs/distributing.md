<!-- i18n: pair=distributing.ja.md sha256=21d761eaf5620d36 -->
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

## Live (questions and polls in class, draft)

An Egatari file (play only) can carry **Live** ([format extension `live`](https://github.com/egatari/egatari-spec/blob/main/extensions/live.md), draft): during the live time you choose, participants who open the file can send questions and answer polls from the lesson itself, without an app or an account. It is the only part of a lesson that uses the network, and only after the participant presses **Join**.

1. **Create a Live** on the teacher page of the Live server (default `https://live.egatari.org`; the service and its protocol are [egatari/live](https://github.com/egatari/live)). Choose the live time (start and end). Bookmark the teacher link it shows once (it carries the code that controls the Live; there is no recovery). **Use a waiting room** lets in only the people you admit.
2. In the editor, **Export ▾ → Distribute with Live (questions and polls)…**. Paste the **Settings to paste into Egatari Studio** copied on the teacher page (Live ID, join code, live time). Turn questions on or off for the whole lesson and add polls per step (a question and 2–6 choices; **Use the step in the preview** takes the step on screen). **To fix before exporting** lists what is still missing, in the editor's language.
3. **Copy poll settings** and paste them into **Poll settings** on the teacher page, so the Live knows the same polls (it refuses votes for questions, polls or choices it does not know).
4. **Export with Live…** writes the Egatari file (play only). Hand it out as usual (download, then open in a browser).

What the participant's copy does:

- **Nothing on the network unless** the file has a Live, the time is inside the live time (2 minutes of leeway at both ends) and the file is opened directly in a browser (from a file or a web address). In the editor's preview, inside another page (an LMS or an embed), in video mode (`?mode=video`), in print and in the presenter view it never connects; in previews and frames it shows the Live ID as text instead.
- **One tap before joining.** The pane says which server the lesson connects to and offers **Join**. While joined it shows a persistent indicator and **Leave**. The choice is remembered for the browser tab only; a new tab asks again.
- **Sends only** questions and votes the participant chooses to send, a name if they type one, a random id made on the device (kept in the browser's storage, or in memory when storage is not allowed) and keep-alive pings. It never sends the viewing position or timing. For questions for the whole lesson, the step key on screen when the participant presses Send is attached to that question.
- **Outside the stage.** Questions and polls appear in a pane at the right (at the bottom on tall screens); the slides are fitted into the rest, so slides, captions, marks, video frames and print are unchanged. A poll appears when its step is reached. Everything from the server is shown as text.
- **Reconnects** only inside the live time, following the Live server's table: after network failures with increasing delays (1, 2, 4 … 30 s, ±20 %); when the teacher ended the Live (4423) slowly, after at least 30 s; when the Live is full (4430) or after “too many messages” (4429) after at least 60 s; when it is too early (4425) at the start time. It stops with a message, and does not reconnect by itself, when the join code was changed (4440), the live time is over or the Live is gone (4410, 4404), the join code is wrong (4403), the same participant joined elsewhere (4409) or the teacher did not admit the participant (4441; **Try again** is offered). While a participant is in the waiting room the pane says so.
- **Size.** A Live on the reference server takes up to 60 participants at once and a live time of at most 3 hours; the editor refuses a longer live time.
- **Restricted connections.** The copy has a content security policy whose `connect-src` is exactly the Live server (`https://` and `wss://` of its host); the player also checks that the WebSocket address has the declared origin. Nothing (scripts, styles, images) is loaded from the server.

The lesson itself keeps the settings without the join code (`extensions.live` in `egatari.json`, and in the single file's index); the join code goes only into the exported copy. Anyone holding the copy can join during the Live; **Change join code** on the teacher page locks out copies that leaked (they then show a clear message). From the command line: `node kit/build.mjs <deck> --play-only --live room.json` (`room.json` is the settings from the teacher page's Copy button; polls come from `egatari.json`'s `extensions.live`, otherwise from `room.json`).

**Rehearse before class:** create a Live whose live time starts now, export, open the copy on two devices, join, send a question and vote, and check the teacher page shows them.
