### Changed

- Attachments: the `egatari.json` inside a single file lists exactly `index.attachments` (spec §3.3); unpacking writes
  `index.attachments` into `egatari.json`, packing reads it, and a file whose two lists differ is refused (`attachments-mismatch`)
