### Fixed

- Editor app: a Space pressed right after opening recording mode (r or **● Record (r)**) is no longer lost. The screen appears and takes the focus at once; until the step is loaded its Space button reads “準備中… / Getting ready…” (`aria-busy`, announced in the live region). A press in that time (key or button) is kept and starts one take as soon as the screen is ready (once, even if pressed twice), and is dropped if opening fails (a declined rights check, no narration, Esc). A refused microphone or a recorder that cannot start is reported as before
- Editor app: opening recording mode again while it is opening or open (r held down, Space on the still-focused panel button) no longer adds a second recording screen that Esc leaves behind
- Editor app: a Space pressed in the preview at the same moment as r no longer reaches the deck (it advanced the slide)
