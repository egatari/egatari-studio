### Fixed

- Editor app: the quality check now reports raw math left in the slides (`rawMath`, such as a leftover `$…$` in an English lesson) as an error, with the same message as `npm run check`, and includes it in the fix request with the R-math standard
- Editor app: the quality check now also runs the other checks that `npm run check` had alone and that need no screenshots or files on disk: です・ます and mixed punctuation, script that reads a formula, broken `{note:}`, long turns and the script language, links to slides, emphasis targets, morphs, image and figure names, slide ids and legacy keys, source outside the 1.0 vocabulary and colours outside the theme's vocabulary (info). Findings the fix request did not map to a standard now take it from the check messages (`ruleOf`)
- `tools/test-check-parity.mjs` (in `npm test`) fails when `npm run check` reports a code that the editor's check lacks, unless it is on `CLI_ONLY` in `kit/core/check-parity.mjs` with its reason
- Editor app: the Japanese quote template now reads 「引用する文をここに書く」 (plain form), so a new quote slide no longer trips the です・ます check; the earlier text is still found as template text
