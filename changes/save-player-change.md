### Added

- Saving an Egatari file with a rebuild asks first when the file carried another player (format spec §4.1): **The player will change** names the file's player and the one the saved file will carry; **Save** saves, **Cancel** keeps the changes unsaved. It follows `playerChange` from the export, so a newer version of the same player is not asked about.
