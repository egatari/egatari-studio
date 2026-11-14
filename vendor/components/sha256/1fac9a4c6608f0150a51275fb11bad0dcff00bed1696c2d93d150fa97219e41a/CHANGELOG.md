# m-callout changelog

The part's own versions (Egatari spec §6.1). Releases of the whole library are in the repository's CHANGELOG.md.

## 2.0.0 (components 2.9.0)

- New part: screen steps. A child `<img>` (alt required, a `data` report otherwise; an inlined image over 1 MiB is a `size` report) with numbered circles, leader lines that never cross and labels beside it, one per step. The size report ends with `[image bytes=N]` (the decoded size), so Studio's lesson-wide image check can skip an image already reported. The README says screenshots must not show real personal data.
