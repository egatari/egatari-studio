// Egatari Viewer: refuse to run inside a frame (defense in depth; the server also sends
// Content-Security-Policy frame-ancestors 'none' and X-Frame-Options: DENY, docs/viewer.md).
// A classic script, first in <head>, so it runs before anything else on the page.
(function () {
  "use strict";
  var framed = true;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (framed) document.documentElement.setAttribute("data-framed", "");
})();
