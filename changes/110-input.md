### Added

- Forward viewer counts and timer extensions from the presenter view's current pane to the stage, and mirror stage changes back. Keep input across steps on a slide and reset it only on slide entry or a jump, including a jump to the current slide. Preserve the author's values in the next pane, video and print.
- Reserve keys inside viewer input parts and fields for those controls; keep digits available for page navigation outside parts. Mouse timer clicks leave Space available to advance. Carry the manifest's `viewerInput` capability into built players and portable component entries.

### Fixed

- Clamp timer shortening to the elapsed time so that remaining time stays nonnegative. Keep the extension total through step resets, make `extend(0)` read-only, and retain the one-hour cap without changing authored durations or the timeline.
