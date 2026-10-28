### Fixed

- Long lessons made in two rounds: after creating the first slides from the outline, opening "Ask for the next 6" right away could leave "Insert" disabled for good, even with both fields accepted (✓ slides, ✓ script). The creating dialog still finished its work (the quality check after the build) in the background and then recomputed the shared button as if it were still waiting for the outline. A dialog now updates the button only while it is the one shown.
