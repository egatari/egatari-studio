### Added

- Viewer: when a lesson records edits (`metadata.edits`, spec §3.6.1), a line under the title says who created it and the most recent edit (「作成：… ／ 編集：… ほか n 件」 / "Created by … / Edited by … and n more"); pressing it lists every edit, oldest first, with copyright and license. It reads `deck-meta`, so it shows whatever player the file carries. New test `tools/test-viewer-credits.mjs` (Chromium and WebKit).
