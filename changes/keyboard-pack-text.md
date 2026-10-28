### Fixed

- Instructions for the AI (music series): `m-keyboard`'s `range` now says to include every key the lesson uses (both ends white keys, 1–3 octaves), and the keyboard is no longer described as sounding the notes: the 0.6.0 player never calls `events(k)`, so parts make no sound. Restore the sound wording with #114 (planned for 0.6.3).
