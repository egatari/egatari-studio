### Added

- The make and studio skills tell the user once per conversation when they are older than the Studio in use, and keep working: “The Egatari skill is an old version (<version>). You can update it with /plugin (Marketplaces → egatari → Enable auto-update keeps it updated automatically).” (in Codex, `npx egatari@0.6.x skills update`). studio compares its version with the new `egatari doctor` line; make compares it with the Studio version recorded in a file the user opens (`generator.version` in the `deck-meta` of a `.ega.html`, or `version` in the `deck-meta` of a working folder's `out/deck.html`). No network calls
- `egatari doctor` prints the skill instructions and Studio version it carries: `ok   skills   指示の版 b2ad9e7c（Studio 0.6.10）/ skill instructions b2ad9e7c (Studio 0.6.10)`. Both skills carry a generated skill version line (`**スキルの版：…**` / `**Skill version: …**`) under the instruction version

### Changed

- Install steps (README “Get started”, “Using it with Claude Code” and “Using it with Codex”, docs/with-claude, both skills) now say to turn on auto-update right after installing: in Claude Code `/plugin` → Marketplaces → egatari → Enable auto-update (third-party marketplaces start with auto-update off); in Codex `npx egatari@0.6.x skills update` after each Studio release, because the skill's instructions and quality checks change with each release.
  The editor's “Download the AI skill” hint (New… and, newly, Help) adds “Add it again when Studio is updated”
