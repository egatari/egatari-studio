### Changed

- Attachments (spec §3.8, still draft): each role takes only its formats (pdf: PDF; data: CSV, TSV, JSON, text, xlsx; code: source,
  ipynb, environment files; source: TeX, Markdown, text, docx; supplement: PNG, JPEG, WebP, PDF, text), checked by name and content
- Attachments: executables (also `.js`, `.bat`), HTML, SVG, archives, macro or legacy Office, audio, video and files of two types
  are never attached, nor PDFs with JavaScript, automatic actions or embedded files, nor Office files with macros or external links
- Attachments: `--portable` leaves such files out and a tier A save refuses them, naming the rule; the editor refuses them on add,
  rename or role change; the checker reports MUST NOT cases (audio and video too) as errors and SHOULD cases as warnings
- Attachments: formula injection in CSV, TSV and xlsx and credential-like text are warnings only; encrypted PDFs that open
  without a user password are decrypted and checked; decompression is bounded
- Attachments: the player offers only the formats each role takes and checks the first bytes before saving
