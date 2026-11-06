### Changed

- Skill `egatari-studio:studio`: the last build is now `npx egatari@0.6.x build <deck> --portable`, so a lesson ends in an Egatari file (`<title>.ega.html`) that plays anywhere and opens in <https://studio.egatari.org/> to edit or add audio. Plain `out/deck.html` is built only when the user asks for plain HTML; the play-only file (`--play-only`) only when asked
- Skill `egatari-studio:studio`: file info (license, copyright, creators) is asked once, in one line, with the outline; the final build no longer stops to ask. Unanswered fields are left out (never made up), and the final message says so and names the `.ega.html` path
- Skill `egatari:make`: the hand-off to `egatari-studio:studio` says it finishes with an Egatari file. The instructions for the chat AI do not change
