### Fixed

- Blackout (`b`) now really blacks out: a full-window black (#000) cover goes over the slide, ink, captions, the control bar and notices (before, the active slide stayed visible and only the ink and captions hid). `b` again, a click or Esc brings the screen back as it was; focus stays on the cover meanwhile and returns afterwards, and tool keys do nothing. The presenter view shows "Blacked out", and its own `b` toggles the main window. Print and video mode are unchanged (video mode cannot enter blackout).
