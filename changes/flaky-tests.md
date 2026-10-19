### Fixed

- Tests: `test-bounded-read` measures memory growth after loading instead of the absolute peak (Node 24 starts larger);
  `test-app` waits for the stage to refit before measuring a comment point and compares within one screen pixel
