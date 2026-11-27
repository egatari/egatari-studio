### Fixed

- Editor: **Request a part…** could not send from the published editor: after about 20 seconds the dialog said the check frame could not be loaded. The relay's deploy (Wrangler, esbuild `keepNames`) wrapped functions of the frame's script in `__name(…)`, a helper the frame did not have, so the script stopped before it said it was ready. The relay now deploys without `keepNames` and the frame's script defines the helper itself; a test bundles the relay as a deploy does and checks that the frame says ready. Only the relay at request.egatari.org is deployed again (handoff #35)
