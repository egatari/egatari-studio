### Added

- Editor: **Request a part…** (next to **All parts** on the first screen, and in step 4 of **New…**) sends what a creator wants to show, and optionally the subject and grade, as a public issue in egatari/components with the label `request`, without a GitHub account (handoff Issue #35)
  - Only the typed text is sent, through a new relay (`relay/`, a Cloudflare Worker with Turnstile; see relay/README.md); drawings and photos are not sent. The editor page keeps `connect-src 'self'`: the check runs in a frame of the relay's page
  - Until the relay is set up, and in the offline editor, the dialog says requests are not available and links to the components issue page on GitHub
