### Added

- Build: `metadata.offer` in `egatari.json` (format spec §1.2) is copied into `deck-meta.offer` by every build (the working
  folder's `out/deck.html`, the Egatari file and its play-only copy) and into the index's `metadata.offer`, together with
  `metadata.primary`; a former `learn` is written as `talk`, unknown values are dropped. Reading a file accepts the former `learn`

### Changed

- Editor app: the preview always passes the chosen mode (`?mode=talk` or `video`), so a lesson's `offer.open` does not change
  what the preview shows; a former `learn` preview mode is read as the slide show
- Docs: reference, contract and editor describe playback in the slide show and the offered modes and faces instead of the
  `learn` mode; the termbase replaces the undecided self-study row with Play / Pause and Playback speed
