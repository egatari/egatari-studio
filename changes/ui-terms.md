### Changed

- The words on screen, in the docs and in the skills now follow one termbase (`docs/terms.json`, with the table `docs/terms.md`): step (was 段階), script (was 口述原稿 / narration), part (was 部品 / component), Egatari file (was 1 ファイル / single file), play-only (was 再生のみ), Export and its messages (エクスポート, not 書き出し; only the audio panel's 「台本を書き出す」 keeps 書き出す), template, samples, Live / host / participant / join code (was 授業の部屋 / 教員 / 学ぶ人 / 鍵, room, teacher, learner, key), black screen (was 暗転 / blackout), laser pointer, thumbnail (was 縮図), player (was 再生器), emphasis (was 注目の演出 / 印, attention marks), timing (was 動きに合わせる所 / cue), comments (was AI へのメモ / notes for the AI), Cancel (キャンセル, was 取消) and What to convey (伝えたいこと, was 言いたいこと / purposes). Ids, file formats, CLI flags and the instructions for the AI (pack version 8e0efb1a) are unchanged.
- Audio panel: an unknown voice now says 「声「x」はこのエディタでは使えません。既定の声「bob」で作ります」; Export script reports 「台本を書き出しました（n ステップ）。次は「Colab を開く」」 without the file name; unused imported audio names the place in plain words (「使っていません：スライド 3・ステップ 2（台本が変わっています）」); the voice sample button is 「▶ 試聴」 / “▶ Preview”. The edit prompt is titled 「このファイルを編集しますか」 with 「編集を有効にする」.
- 授業 is no longer a display mode: it is the option 「先のステップを薄く見せる」 / “Show later steps faintly” (key `l`), shown like captions in the control bar, the presenter view, the key list and Preview ▾ (a checkbox next to the slide show and video modes). `?mode=lecture` still opens the slide show with the option on.

### Added

- `npm run lint:terms` (also in `npm test`): flags avoided words of the termbase in UI strings, docs and skills, with `docs/terms-allow.json` for legitimate uses, and fails where a Japanese UI string's term has no matching English term in its partner.
