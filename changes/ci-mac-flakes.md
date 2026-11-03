### Fixed
- Tests: test-bar-hint counts "still shown after 3.6 s" from when the bar was shown (the time to open the page and take a screenshot was added on slow macOS CI), and test-check-contrast reads colours with a CPU canvas (`willReadFrequently`, as the quality check does): the GPU canvas read back zeros on a loaded macOS runner (contrast 1.00:1).
