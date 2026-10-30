### Added
- Distribute two entries in the egatari marketplace: a generated light egatari plugin with only make and no Node requirement, and egatari-studio with the repository tools and one studio skill (#126).
- Generate egatari-make-skill.zip from the same make content using only Node built-ins; verify the plugin payloads and ZIP contents against the generator.
- Add a CLI entry point for exporting working folders or single files with existing audio as video, and a regression check for personal environment references in plugin documentation.

### Changed
- Move local checks, builds, audio, parts and video instructions into egatari-studio:studio; retain motion-slides, motion-components and motion-slides-video in descriptions for one release. Document installing both plugins for studio and updating each separately.
- Separate chat authoring from CLI checks and audio setup, document the optional local speech server, and keep parts' Components 2.0 rewrite for #123. The detailed make/studio content redesign remains separate.
