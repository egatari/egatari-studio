### Changed

- Quality check (`npm run check` and the editor app): the Japanese messages now say 「ステップ」 for a click-forward within a slide, as the glossary decides, instead of 「段階」 (for example 「ステップ 2」, 「結論のステップ」, 「このステップの口述原稿がない」). The wording of the messages is otherwise unchanged and the English messages are untouched. The terms lint (`npm run lint:terms`) now scans `kit/check-messages.mjs` too, so the old word cannot come back; the spec and file-name words that the messages quote on purpose (口述原稿, 部品, デッキ and so on) are listed in `docs/terms-allow.json`
