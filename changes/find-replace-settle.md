### Fixed

- Find and replace: pressing Replace (or Next, Previous, Replace all) right after typing no longer loses the selected match to the recount that was still waiting, which made a second Replace only select again (found by test-app-undo on the Windows CI, handoff #86)
