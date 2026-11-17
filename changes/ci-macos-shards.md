### Changed

- CI and tests (handoff Issue #10): `npm test -- --skip-os-independent` leaves out the heavy tests marked `// test-all: os-independent` (now `test-pack-catalogue`);
  macOS sets it on every run except a `v*` tag push, while Linux and Windows run them every time. test-app runs as three steps (`test-app 1/3`–`3/3`) instead of two.
