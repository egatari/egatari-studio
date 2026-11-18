### Fixed

- Editor: opening a single file whose parts mark readable content (§2.1, e.g. `m-trace` in the bundled `parts-showcase`) no longer stalls for about 40 s on "reading". The index-only dry export that the editor runs while opening (`exportIndex`) asked the not-yet-loaded preview for the parts' readable content and waited for its 20 s limit, once per rebuild; it now skips that step (the readable layer does not affect the index), and a real export asks the preview once per export instead of once per retry. `tools/test-workspace.mjs`
