### Changed

- AI instructions, 国語 (kokugo) set (handoff #70, owner 2026-11-21): keep one file vertical or horizontal. A file that reads a classical or modern Japanese text puts its explanation slides in vertical writing too; only slides with a figure or table that works only horizontally are horizontal, kept together, never alternating
- Quality check (R-style, a warning in the command-line check and the editor; handoff #70): `tateMixed` when vertical (`layout-tate`) and horizontal slides switch three or more times, not counting the cover and dividers. It names the count and says to keep one direction and put horizontal figure or table slides together. `kit/core/tate-mix.mjs`, `tools/test-tate-mix.mjs`
