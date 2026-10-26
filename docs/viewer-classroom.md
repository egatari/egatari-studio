<!-- i18n: pair=viewer-classroom.ja.md sha256=864ef9cce3940753 -->
# Handing a lesson to students on iPad (Classroom and Egatari Viewer)

English | [日本語](viewer-classroom.ja.md)

On an iPad, a lesson does not run when its HTML file is opened from the Files app. Students open it in **Egatari Viewer** (`https://viewer.egatari.org/`; on the Home Screen it is called **Ega Viewer**). The file is read on the iPad and never uploaded.

A lesson shared as a link in Slack or Teams plays directly on iPhone and iPad (their in-app browsers run the lesson's scripts). Egatari Viewer is needed for files opened from Classroom and the Files app, where iOS shows HTML without running its scripts.

<!-- On-screen words are those of the ui-redesign line (File ▾ → Export ▸ → For participants (play-only)…). On the current main line
     the item is "Export ▾" → "Export Egatari file (play only, .play.ega.html) for participants", which asks where to save right away (no dialog).
     Checked on an iPad (2026-10-27, the owner): it opens in Chrome and in Safari and can be added to the Home Screen from both (after "More"; Chrome with "Open as Web App" on); added from Chrome it opens offline; Open a file offers Google Drive only in Chrome (Safari shows the iOS document picker). Not checked yet: the English labels, Classroom's ︙ menu, and Google Drive as a Files location in Safari -->

## Teacher: export the play-only file and post it in Classroom

1. In Egatari Studio, open the lesson and choose **File ▾ → Export ▸ → For participants (play-only)…**.
2. Press **Export…** in the dialog and save the file (named `….play.ega.html`). A play-only file only plays; it cannot be edited. Keep the original file for later changes.
3. In Google Classroom, create a Material (or an assignment), attach the file and post it. Add this line for students:

   > On iPad, save the file first, then open it with **Open a file** in **Ega Viewer**.

## Student: open it in Ega Viewer on the iPad

1. Once: open `viewer.egatari.org` and add it to the Home Screen. In Safari: Share → "More" → "Add to Home Screen" → "Add". In Chrome: Share → "More" → "Add to Home Screen" (keep "Open as Web App" on) → "Add". The Viewer's start screen shows the same tip. **Ega Viewer** appears on the Home Screen with the え icon, and from then on it opens without a network.
2. An Ega Viewer added from Chrome needs no saving (Google Drive in step 3). One added from Safari needs the file saved on the iPad first: open it in Classroom or the Google Drive app, then ︙ → Open in → Save to Files.
3. Open **Ega Viewer**, press **Open a file**, and choose the saved file under "Choose File". When it was added from Chrome, "Google Drive" is offered too (Classroom attachments are in the Classroom folder). The bar shows the lesson's title and "Egatari file (play-only)", and the lesson plays. Tap the slide to show the control bar at the bottom: → (Next) moves on, and Captions shows the captions.
   - When it was added from Safari, Google Drive can probably still be chosen under "Choose File" if it is turned on as a location in the Files app (Browse → Edit). Not checked yet.
4. Next time, open it from Recent files on the start screen (on an iPad several people use, turn on Shared device so nothing is kept).

A lesson with Live (questions and polls) first shows Join and Watch without joining. Only joining the Live uses the network.

If something goes wrong, do what the message on the screen says (for example, "This is not an Egatari file. …" means: choose a .ega.html file instead). It is expected that the lesson does not run in Classroom's preview or in the Files app.

More in [Egatari Viewer](viewer.md) and [Handing a lesson to learners](distributing.md).
