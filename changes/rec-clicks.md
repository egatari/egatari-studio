### Fixed

- Remove keyboard and trackpad clicks at the start and stop of recording-mode takes before trimming silence and normalizing the level. Takes too short to keep after removing the clicks show a clear message.
- Shift click cuts by reported input latency and keep a 30 ms head cut plus that latency for key or button starts, including delayed headset capture.
