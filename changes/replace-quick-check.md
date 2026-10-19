### Fixed

- Editor app: after **Paste AI output** → **Replace the current deck** in a working folder, the quick check no longer stops with
  “Could not check (the deck did not answer)”: it waits for the rebuilt preview and asks that one (and asks again if the preview reloads)
- Editor app: the quick check waits until the deck is ready instead of answering with no results
- Editor app: the quick check note no longer ends with “… is npm run check” as if cut off; it says what is checked and that
  **Copy fix request for your AI** (shown when there are results) has the AI fix the errors
