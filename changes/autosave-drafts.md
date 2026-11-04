### Added
- Editor app: unsaved changes to an Egatari file (edits and recordings) are kept in this browser (IndexedDB) a few seconds after each change, and opening the same file again (or the first screen's "Unsaved changes" list) offers to restore them (#55). Each tab keeps its own changes; saving or "Discard changes" deletes them, and help has "Discard all". Working folders are not affected.
