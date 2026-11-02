# m-orbit changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.1.0)

- New part: the phases of the Moon (`mode="moon"`) and of Venus (`mode="venus"`). A top view seen from above the North
  Pole sits beside the view from Earth, both driven by one position. Shapes are computed from the geometry (phase angle
  and lit side), not drawn. Labels come from the lesson language and can be set per position. There is an observer
  on Earth with a line of sight, eclipse alignments (`eclipse`), and a southern-hemisphere orientation.
