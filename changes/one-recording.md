### Changed

- Editor app: one way to record. The Audio panel's **● Record (r)** opens recording mode at the panel's step (Space, speak, Space, Esc);
  the panel stays open behind it and then shows the new take. Parity of the old panel recording: docs/recording-parity.md
- Editor app: recording mode reports a stop at the 600 s limit, stops there also in a background tab, and reports a recorder that cannot start

### Fixed

- Editor app: recording mode shows a failed take's error (an empty or undecodable take, a recorder that cannot start) instead of failing silently

### Removed

- Editor app: recording inside the Audio panel (its button, meter and “Record again”); use recording mode
