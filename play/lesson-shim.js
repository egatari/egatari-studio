// Egatari Play: the page's own small script at the start of the lesson document, before the lesson's bytes
// (the trusted prefix of app/preview-doc.js, spec §11). It runs in the lesson's sandboxed frame (opaque origin) and has no
// more power than the lesson: the page treats every message from the frame as an untrusted request (play/main.js).
//   1. ?embed=1: a srcdoc document has no address of its own, so the embedding mode (spec §9.4: position events) is set
//      through history, as the editor's preview does (app/frame-shim.js). Players that ignore it still send their legacy
//      deck-pos messages, which the page also reads.
//   2. Links that leave the lesson: the frame cannot open windows (no allow-popups). A click on such a link is handed to
//      the page as {egaPlay: "openLink", href, text, download}; the page applies the link rule (kit/core/link-policy.mjs)
//      in its own chrome. Links inside the lesson (#…, spec §9.1A) stay with the player.
(function lessonShim() {
  "use strict";
  try { history.replaceState(null, "", "about:srcdoc?embed=1"); } catch (e) { /* the page falls back to deck-pos */ }
  var parentWin = window.parent;
  function send(href, text, download) {
    try { parentWin.postMessage({ egaPlay: "openLink", v: 1, href: String(href == null ? "" : href).slice(0, 4096), text: String(text || "").slice(0, 1000), download: !!download }, "*"); } catch (e) { /* gone */ }
  }
  function linkOf(e) {
    var p = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (n && n.nodeType === 1 && (n.localName === "a" || n.localName === "area") && n.hasAttribute("href")) return n;
    }
    var t = e.target;
    return t && t.closest ? t.closest("a[href],area[href]") : null;
  }
  function inDoc(a) {
    var h = a.getAttribute("href");
    if (h == null || h.charAt(0) === "#") return true;
    try {
      var u = new URL(h, location.href), here = new URL(location.href);
      if (u.hash && u.origin === here.origin && u.pathname === here.pathname && u.search === here.search) return true;
    } catch (e) { /* not resolvable here: it leaves the lesson */ }
    return false;
  }
  function onClick(e) {
    if (e.type === "auxclick" && e.button !== 1) return;
    var a = linkOf(e);
    if (!a || a.__egaOwn || inDoc(a)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    send(a.getAttribute("href"), (a.textContent || "") + " " + (a.getAttribute("aria-label") || a.getAttribute("alt") || ""), a.hasAttribute("download"));
  }
  window.addEventListener("click", onClick, true);
  window.addEventListener("auxclick", onClick, true);
  // The player's own window.open (after its confirmation box, presenter view): no popups here; ask the page instead
  window.open = function (u) { if (u != null && !/[?&]presenter=1/.test(String(u))) send(u, "", false); return null; };
})();
