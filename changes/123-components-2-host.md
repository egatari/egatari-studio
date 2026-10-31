### Added

- Components 2.0 lessons can be exported as portable `.ega.html` files. The index records the parts actually written, including libraries in dependency order, exact versions and requirements, embedded part metadata, licenses, build-time renderer records and subset hashes. Unpacking, rebuilding and tier A edits preserve those records.
- The editor bundle carries the Components 2.0 catalogue and host. Parts use the shared `components.lock.json` content table and `resolveComponent()` to find `vendor/components/sha256/<hash>/`; existing 1.x defaults stay unchanged.
- Quality checks show a part's layout reports as warnings in Japanese and English, with the part's name, its explanation and a suggestion to give it more space or show less content. The editor preview uses the same warning categories.

### Fixed

- Lessons using only 2.0 parts omit the player's 1.x component base, registration function and public drawing helpers. Lessons using 1.x parts keep them. Layout calls and the following renders receive separate context objects.
- Merge the 2.0 registry, context, containment, layout and off-screen rendering rules with narration notes, the existing themes and fonts, SVG text overlap checks and content-addressed component storage. Refresh the local specification fixtures used by these checks.
