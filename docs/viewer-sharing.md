<!-- i18n: pair=viewer-sharing.ja.md sha256=19c0b85683759f7f -->
# Opening a lesson on iPhone and iPad (Egatari Viewer)

English | [日本語](viewer-sharing.ja.md)

On iPhone and iPad, an Egatari file (.ega.html) does not run when it is opened in the Files app or in a file preview (iOS shows HTML there without running its scripts). Open it in **Egatari Viewer** instead (`https://viewer.egatari.org/`; on the Home Screen it is called **Ega Viewer**). The file is read on the device and never uploaded.

Apps that open HTML themselves, such as Slack and Teams, play the file without the Viewer (their in-app browsers run the lesson's scripts).

<!-- On-screen words are those of the ui-redesign line (File ▾ → Export ▸ → For participants (play-only)…). On the current main line
     the item is "Export ▾" → "Export Egatari file (play only, .play.ega.html) for participants", which asks where to save right away (no dialog).
     Checked on an iPad (2026-10-27, the owner): it opens in Chrome and in Safari and can be added to the Home Screen from both (after "View More";
     Chrome with "Open as Web App" on); added from Chrome it opens offline; Open a file offers Google Drive only in Chrome (Safari shows the iOS
     document picker). iOS does not list Home Screen web apps (Ega Viewer) in the share sheet: save the file to Files, then choose it in the Viewer.
     The English labels "View More" and "Add to Home Screen" were checked in Chrome on an iPad. Not checked yet: Google Drive as a Files location in Safari.
     This document stays channel-neutral: no menu steps of a particular channel (Classroom and so on) -->

## Sender: export the play-only file and hand it out

1. In Egatari Studio, open the lesson and choose **File ▾ → Export ▸ → For participants (play-only)…**.
2. Press **Export…** in the dialog and save the file (named `….play.ega.html`). A play-only file only plays; it cannot be edited. Keep the original file for later changes.
3. Hand it out the way you usually do (for example Classroom, Google Drive or mail). For people on iPhone or iPad, add this line:

   > On iPhone and iPad, use "Save to Files" first, then open the file with **Open a file** in **Ega Viewer**.

## Receiver: open it in Ega Viewer on iPhone or iPad

1. Once: open `viewer.egatari.org` and add it to the Home Screen. In Safari: Share → "View More" → "Add to Home Screen" → "Add". In Chrome: Share → "View More" → "Add to Home Screen" (keep "Open as Web App" on) → "Add". The Viewer's start screen shows the same tip. **Ega Viewer** appears on the Home Screen with the え icon, and from then on it opens without a network.
2. Put the file on the device: in the app that received it (mail, Google Drive, a school app and so on), open the file's share menu and choose "Save to Files". A file in Google Drive can also stay there (step 3). Ega Viewer is not listed in the share sheet, so it cannot be opened from there directly.
3. Open **Ega Viewer**, press **Open a file** → "Choose File", and choose the saved file. In an Ega Viewer added from Chrome, "Google Drive" is offered too. The bar shows the lesson's title and "Egatari file (play-only)", and the lesson plays. Tap the slide to show the control bar at the bottom: → (Next) moves on, and Captions shows the captions.
   - When it was added from Safari, Google Drive can probably still be chosen under "Choose File" if it is turned on as a location in the Files app (Browse → Edit). Not checked yet.
4. Next time, open it from Recent files on the start screen (on a device several people use, turn on Shared device so nothing is kept).

A lesson with Live (questions and polls) first shows Join and Watch without joining. Only joining the Live uses the network.

If something goes wrong, do what the message on the screen says (for example, "This is not an Egatari file. …" means: choose a .ega.html file instead). It is expected that the lesson does not run in a file preview or in the Files app.

More in [Egatari Viewer](viewer.md) and [Handing a lesson to learners](distributing.md).
