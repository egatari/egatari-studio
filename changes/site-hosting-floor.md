### Changed

- Hosted editor site: releases below the hosting floor (`HOSTED_FROM` in `tools/site-versions.mjs`, now v0.6.0) are no longer served under
  `/vX.Y.Z/`; that path shows a short Japanese and English page linking to the version's GitHub release and to the latest version. The
  version lists show only hosted versions, and the size warning names the oldest hosted versions as candidates for the next floor raise
