### Added

- Egatari Player 1.5.0: an embedded lesson (`?embed=1`) takes the remaining Player P8 commands. `{egatari:"seek", id?, slide, step, t}` (slide key or index from 0, step key, seconds or `null` for the final state) moves there, keeping the playing state, and replies `{egatari:"seeked", id?, slideKey, stepKey, t}` after the `position`;
  `{egatari:"preview", id?, on}` and `{egatari:"controls", id?, visible}` switch the faint preview of later steps and the player's own controls at run time and reply in the same shape
- Egatari Player 1.5.0: an embedded lesson sends `{egatari:"stepEnded", slideKey, stepKey}` when playback has played a step to its end (not for skipped steps or when paused) and `{egatari:"ended"}` after the last step.
  `snapshot` (OPTIONAL in Player P8) and unknown commands reply `{egatari:"error", id, code:"unsupported"}`; bad arguments reply `error` with the command's name as `code`, as `mode`, `rate` and `layout` already did

### Changed

- Egatari Player 1.5.0 (the bundled player that files carry, `player` in the index and `deck-meta`): minor release. Hosts can now drive an embedded lesson with every required Player P8 command and follow playback through `stepEnded` and `ended`
