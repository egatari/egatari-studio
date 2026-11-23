### Fixed

- Studio: the comments of an Egatari file are no longer lost when the file is closed. They are not saved in the file, so Studio keeps them in this browser for each file (by its `docId`) and brings them back when the same file is opened again, also after it was saved. Comments not changed for 90 days are deleted; **? → Comments kept in this browser** shows how many files have them, with **Delete all**.
