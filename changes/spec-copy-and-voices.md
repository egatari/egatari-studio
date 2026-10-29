### Changed

- `tools/sync-spec.mjs` copies only what the tests read (an allow-list), so `vendor/egatari-spec` shrinks from 54 MB to 14 MB; the unread pre-1.0 document fixtures are no longer copied.
- The default reference voices `alice.wav` and `bob.wav` now exist only in `tts/voices/`; the identical copies in `lab/voices/` are removed. The Colab notebook reads them from `tts/voices/`.
- README: the quick start clones with `git clone --depth 1`.
