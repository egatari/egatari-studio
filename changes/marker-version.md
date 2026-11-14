### Changed

- Japanese wording: the version lines at the top of the AI instructions and the skills are now 「指示のバージョン：…」 and 「スキルのバージョン：…」 (were 指示の版 and スキルの版), and `egatari doctor` prints 「指示のバージョン …（Studio X.Y.Z）」. `egatari doctor`, `tools/make-llm-guide.mjs` and the studio skill still read the old names, so a skill installed from an earlier version is compared as before (backlog #205). The terms-allow entry for 指示の版／スキルの版 stays until v0.6.14, two releases after this one, and is removed then
