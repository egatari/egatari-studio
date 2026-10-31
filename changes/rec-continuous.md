### Added

- Recording mode has a “Keep recording” option, on by default and remembered on this device. Enter keeps the take and, after processing and saving it, starts recording the next step if its audio is missing or stale. Steps with current audio wait, and the last step stops. Turn the option off to wait at every step. Enter's press and release clicks are removed from both takes; step changes play no audio. Screen readers announce the step while recording continuously.
- Click removal accounts for reported microphone input latency. Takes started with a key or button remove at least the first 30 ms plus that latency, including when a headset starts capturing after the key is released.
