### Changed

- Japanese wording: a software version is now バージョン, not 版 on its own (「このバージョンの Studio」「以前のバージョンの Studio で開く」「今後のバージョンで入れます」, and the Viewer's about panel). Compounds such as 正式版, 最新版, ブラウザ版 and オフライン版 stay. A file made before Egatari 1.0 is now 「旧形式のファイル」 / “File in an older format” (was 前の版のファイル / “File from an earlier version”). Tools are ツール, not 道具 (「発表のツール」, 「AI のコーディングツール」, the Tools group in New…). Owner decisions 2026-11-13
- Glossary (docs/terms.json): new term software-version; earlier-draft-file and tools updated; the missing decision dates of pen, recording, recording-mode and chat-ai filled in
- `npm run lint:terms` flags 版 used alone (a pattern rule, `avoidPatterns` in docs/terms-allow.json), and `node tools/lint-terms.mjs --prose <folder> [--glob <pattern>] [--exclude <pattern>] [--allow <allow.json>]` checks another repository's prose and strings (the site, the parts library, the samples) against this glossary
