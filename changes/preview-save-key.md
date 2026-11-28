### Fixed

- Editor: **⌘S / Ctrl+S** saves the file also when the focus is in the slide preview. After an edit the preview reloads and takes the focus, so the shortcut pressed then reached the preview and did not save (in Chrome it could open the browser's own Save page). The preview now passes the shortcut to the editor, which saves under the same rules as elsewhere (handoff #80)
