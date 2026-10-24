### Fixed

- Importing live room results from a newer Live server no longer fails: members and kinds this Studio version doesn't know (members or kinds added by a later Live server) are ignored, and the import lists what it skipped, in the Attachments panel, in Distribute with Live, and in `npm run portable -- attach`. The attached file keeps the original bytes; anything malformed in a known member is still refused
