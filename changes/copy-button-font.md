### Fixed

- Editor: a **Copy** button could still grow by a few pixels when it said “✓ Copied” for the first time: if the font for those characters started loading only after the width was measured, the width came from the fallback font. The buttons are measured again whenever fonts finish loading
