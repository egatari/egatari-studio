### Fixed

- Egatari Viewer: a launch at the start screen while another window of the Viewer was still listed (the same tab's previous page still unloading on a slow device, or a window that closes during the launch) left the new version waiting until the next launch: the page now asks again each second while it launches. A takeover asked by the previous page just before the new one loaded now reloads the new page too (Windows CI, runs 41596890832 and 41605131017)
