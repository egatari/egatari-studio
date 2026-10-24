### Added
- 写した仕様（vendor/egatari-spec）が従う日付の版（egatari-spec の `wd-YYYY-MM-DD` のタグ）を SOURCE.json の `snapshot` に残す。`tools/sync-spec.mjs --ref wd-2026-10-24` で写せる。タグでないコミットは `snapshot: null` になり、`tools/spec-snapshot.mjs --check`（test-all）が知らせる（知らせだけ）
- 編集アプリの「使い方」に「形式：Egatari 1.0 WD 2026-10-24」と出す（ビルド時に SOURCE.json から読む）

### Changed
- vendor/egatari-spec を WD 2026-10-24（72f8821）に合わせる。Schema・試験用の入力は変わらず、SOURCE.json だけが変わる。RELEASING に、候補の前に最新の WD と揃えることと、リリースの説明に従う版を書くことを足す
