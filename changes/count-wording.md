### Fixed

- English: a count of 1 now takes the singular in the editor and on the command line (“1 error · 1 warning”, “1 error, 1 warning” in `npm run check`, “1 finding”, “1 slide”), instead of “1 errors” or “finding(s)”. A unit test covers count 1 and lints the English strings of the editor and the quality check messages so the plural cannot come back
