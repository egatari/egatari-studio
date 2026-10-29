### Fixed

- Quality check panel: build warnings now count in the summary and the toolbar badge (「エラー 0 · 警告 0」 no longer sits above a list of build warnings). A build warning about a slide shows the slide number and title instead of internal names (`## s-…`, narration.md line numbers) and goes to that slide when clicked, like the checker's findings.
- Steps whose audio needs updating are listed once, as a Quality check finding on their slide (step number only), not again as a build warning with the internal step key.
