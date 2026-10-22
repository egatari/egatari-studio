### Added

- Live, one way: **Distribute with Live** makes the Live ID and join code itself (from a random setup secret, `crypto.getRandomValues`; still no network request) and shows one string that the host pastes once on the host page, which creates exactly that Live (egatari/live PROTOCOL.md §2.1). The string holds a secret that is not in the exported file, so a copy of the file alone cannot be used to create the Live. The earlier way (create on the host page, paste its settings back) stays under a fold. The vendored protocol is updated to egatari/live branch `one-way-setup`
