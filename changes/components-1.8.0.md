### Changed

- Components v1.8.0: **`m-map-japan` draws differently by default, a visible change for existing lessons once they move to v1.8.0**: the 小笠原諸島 inset is off unless `islands="all"`, and 北方領土・竹島・尖閣諸島 are drawn at every size. Lessons that recorded v1.7.x or earlier keep their drawing until their author updates. New demo slide 「日本の範囲（本当の位置）」 with `layout="true"`; labels no longer sit inside the inset frames. Release notes: [egatari/components v1.8.0](https://github.com/egatari/components/releases/tag/v1.8.0)

### Added

- Components v1.8.0: `m-timer` is a tool (manifest `components.timer.group: "tool"` with its own tile 「タイマー」 / "Timer"), and it has bells (`bells`, declared with `events(k)`). Studio ignores the bells for now; the clock and colours still carry the time.
