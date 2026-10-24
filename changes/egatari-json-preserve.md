### Fixed

- `egatari.json`: every Studio writer (export and unpack, Save and Save as new lesson, the Attachments and Live panels, **Update theme**,
  **Rebuild with** a replacement version, `--update-themes`, `npm run portable -- attach`) now changes only its own members and keeps every
  other member byte for byte, in place, through one helper `updateConfig(oldText, patch)` (`kit/core/config-file.mjs`). Before, the file was
  parsed and re-serialized, which reformatted other producers' members, rounded large integers, turned `1e400` into `null` and moved numeric
  member names first (format spec §3.3: other producers' members are preserved unchanged). A file that is not a JSON object is now refused
  instead of being overwritten
