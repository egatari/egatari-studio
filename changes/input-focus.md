### Fixed

- `b` now blacks out the screen: a full-window black cover goes over the slide, ink, captions, the control bar and the key help (before, the current slide stayed visible). `b` again, a click or Esc brings the screen back, Esc leaves blackout before it closes the key help, and entering blackout cancels the outside-link box. Print and video mode are unchanged
- Keys reach the slides after using the pen or clicking the editor: a click on the slide with the pen or laser on (or on the control bar) moves focus into the deck; in the editor app, after a click on the toolbar, header or status bar, the arrows, PageUp/PageDown, Home/End, `b`, `a` and `f` go to the preview (never Space or Enter, and never from a text field, the narration drawer or an open dialog), and toolbar buttons clicked with the mouse no longer keep focus
- Editor app: while unsaved narration holds the preview, a click or key on it shows why, with Save and Revert next to it; the first click on the preview after leaving a narration field now focuses the preview
- The outside-link box keeps focus when you click its text, and Esc and Tab work even if focus has left it
- Presenter view: a click on the "next" pane no longer swallows the keys
