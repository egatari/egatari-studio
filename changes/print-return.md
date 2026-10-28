### Fixed

- Returning from printing no longer clears what the viewer entered in a part (the counts in `m-predict`, a timer's extension). Printing, and the slide overview and the quality check in the editor, draw other positions only to come back; that return was counted as entering the slide, so parts were reset. Such renders now leave `ctx.entered` false and keep the viewer's input. Tools that draw other positions and come back wrap their `DECK.seek` calls in the new `DECK.aside(fn)`.
