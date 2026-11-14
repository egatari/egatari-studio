### Changed

- Parts library 2.8.0 is now the default (release 22ad4bb, tarball eef78dd1…). `m-flow`, `m-tree`, `m-fishbone` and `m-quad` 2.1.0 mark what they draw for the geometry check; drawing is unchanged. `m-particles` 2.0.2 no longer hangs the page when the element is narrower than about 45 px. The other parts' READMEs follow the glossary; their versions are unchanged. The parts gallery is re-synced to the same release
- The m-cycle purposes text is 「順を追って 1 つずつ」 (was 「1 つの段階ずつ」); its terms-allow entry is removed

### Added

- `tools/test-particles-zero.mjs`: a lesson whose `m-particles` is sized 0 × 0, 0 wide or 30 px wide by CSS becomes ready, draws every step and logs no page error or negative size
