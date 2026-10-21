### Fixed

- Live player: a play-only copy opened on Android from the Files app in Chrome (a `content://` address) can now join the live room. It counts as a local file the learner opened, like `file:`; the other conditions are unchanged (not framed, inside the window, exactly one CSP `<meta>` whose `connect-src` is the endpoint, one tap on Join, not in video, print or the presenter view)

### Changed

- Live player: where it cannot connect (inside a frame such as an LMS, a viewer in a chat or file app, another kind of address), the pane offers **Join in the browser**, a link that opens the room's join page (`https://<endpoint host>/join#room=…&key=…`, the key only in the fragment) in a new tab, with a short explanation and the room. Nothing is loaded before it is tapped. The editor's preview still shows only the room's address as text
