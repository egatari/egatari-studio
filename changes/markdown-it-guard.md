### Security

- Book text: markdown-it 13.0.2 (under myst-parser 1.7.4) has five advisories, and three are reachable with the book text of an opened file
  (smartquotes GHSA-r7fv-28h4-cvq7 and GHSA-6v5v-wf23-fmfq, inline HTML GHSA-vfgh-jcmw-g37q; a 1 MiB paragraph took about a minute). The check now
  refuses a book with a paragraph of more than 512 quotation marks (`"` and `'`) or 64 tag openings (`<!`, `<?`) before parsing it
  (`articleUnsafeParagraph`, with the section, paragraph and line), in the CLI and the editor; below the limits nothing changes. markdown-it 14.3.3
  cannot be forced yet (myst-parser and its plugins import a file 14 removed); it comes in v0.6.6 with the bundled book tools. Until then the audit
  workflow allows exactly these five advisories (`tools/audit-check.mjs`; any other advisory at high or above still fails). SECURITY.md has the details
- If you installed `egatari` from npm: `npm audit` reports these five markdown-it 13.0.2 advisories. Only the tools that read a book (`build`, `check`, `ids`, `portable pack`
  and the editor app) are concerned; playing is not (Egatari Viewer and the player in an Egatari file contain no markdown-it). Do not force
  markdown-it 14 with `npm audit fix --force` or `overrides` (it breaks the book tools in 0.6.5); update to v0.6.6 instead (SECURITY.md)
