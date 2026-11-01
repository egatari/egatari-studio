### Added

- Components 2.0 lessons now use egatari/components **v2.1.0** by default (`components2.lock.json`; 2.0.0 stays available): the line icons library `icons` 1.0.0 (Tabler Icons 3.49.0, MIT) and `m-cards` 2.0.0, cards with an icon, title and text in a row or a 2×2 / 3×2 grid with optional step arrows (#142); `m-orbit` 2.0.0, the moon's phases with the view from above and from the Earth linked by one angle. A lesson embeds only the icons whose names its text uses (format spec §6.2 subset by name).

### Changed

- `m-keyboard` 2.0.1: when a step's keys fall outside the keyboard's range, the error lists them and names a range that covers every key (e.g. "use C4-D5"), or says to split them over two keyboards.
