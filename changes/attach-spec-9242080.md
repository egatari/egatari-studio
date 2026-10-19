### Changed

- Attachments (spec §3.8 at 9242080): `title` is required, one line of at most 120 characters (was 200), `description` one line
  of at most 300, counted in code points as in the schema; a bad title keeps it off the list, a bad description is dropped (warns)
- Attachments: the script extensions refused in every role are exactly the spec's list (`.js` … `.lnk`; JavaScript source as
  `.mjs`, `.cjs` or `.ts`), reported as their own category; binary executables stay refused as executables
- Player: offers an attachment only with a valid title, an extension its role takes and the matching media type, saves it under
  its path's file name, and adds "Run code only if you trust its source" to code attachments

### Security

- PDF attachments: `/OpenAction` and `/AA` may only go to a place in the document (`GoTo`), links only `GoTo` or `URI`; other actions
  (`SubmitForm`, `ImportData`, `GoToR`, `GoToE`, `Rendition`, `Named`, …) and PDFs that need a user password are refused
