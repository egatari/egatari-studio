### Added
- Codex support: `.agents/plugins/marketplace.json` lists the same two plugins (egatari, egatari-studio), the plugin manifests declare `"skills": "./skills/"`, and the README has a "Using it with Codex" section (#172).
- `egatari skills update` updates the skills in every tool found on PATH (Claude Code: `claude plugin marketplace update` and `claude plugin update`; Codex: `codex plugin marketplace upgrade` and `codex plugin add`), reports each result, and ends with "restart the tool". `egatari doctor` warns when an installed skill's instruction version differs from the package's (`kit/instruction-version.json`).

### Changed
- The plugin manifests and marketplace entries carry `version`, equal to `package.json`'s; `changelog.mjs --release` sets them and `test-plugin` checks them, so installed tools update when a release is made. The skill texts name both Claude Code and Codex for installing and updating.
