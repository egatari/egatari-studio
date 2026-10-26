// Egatari Viewer: the page's own small script at the start of the lesson document, before the lesson's bytes
// (the trusted prefix of app/preview-doc.js, spec §11). It runs in the lesson's sandboxed frame (opaque origin) and has no
// more power than the lesson: the page treats every message from the frame as an untrusted request (play/main.js).
//   1. ?embed=1: a srcdoc document has no address of its own, so the embedding mode (spec §9.4: position events) is set
//      through history, as the editor's preview does (app/frame-shim.js). Players that ignore it still send their legacy
//      deck-pos messages, which the page also reads.
//   2. Links that leave the lesson: the frame cannot open windows (no allow-popups). On the viewer's own activation (a trusted
//      click while the frame has a transient activation) such a link is handed to the page as the spec's embedding event
//      {egatari: "openLink", href, text, download?} (spec §9.4; text at most 200 characters; download: true for a link with a
//      download attribute, which the page refuses). The page treats it as untrusted, applies the
//      link rule (spec §11, kit/core/link-policy.mjs) itself and opens nothing without a tap in its own interface.
//      Links inside the lesson (#…, spec §9.1A) stay with the player.
//   3. Touch (iPad, iPhone, Android tablets): the player's control bar (kit/tools.js: 前へ・次へ・字幕・読み上げで聞く …) wakes on
//      pointermove, which a finger tap does not send, so after its first few seconds a touch-only viewer had no way to bring it
//      back. A trusted touch tap is relayed to the player as one pointermove (no buttons) at the bottom edge, where the bar wakes
//      even when it lies over the slide. The bar's buttons cancel pointerdown (so that they keep the focus on the slide); WebKit
//      then sends no click after a finger tap, so a tap on a bar button that gets no click within 350 ms is completed with one
//      click on that button (once; a real click cancels it). Nothing else changes: the player's own handlers decide.
(function lessonShim() {
  "use strict";
  try { history.replaceState(null, "", "about:srcdoc?embed=1"); } catch (e) { /* the page falls back to deck-pos */ }
  var parentWin = window.parent;
  function activated() {
    var u = navigator.userActivation;
    return !u || u.isActive === true;   // without the API (older browsers) the trusted click below is the evidence
  }
  function send(href, text, download) {
    var m = { egatari: "openLink", href: String(href == null ? "" : href).slice(0, 4096), text: String(text || "").replace(/\s+/g, " ").trim().slice(0, 200) };
    if (download) m.download = true;   // spec §9.4: present only as true, when the link has a download attribute
    try { parentWin.postMessage(m, "*"); } catch (e) { /* gone */ }
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
    if (!e.isTrusted || !activated()) return;   // only the viewer's own activation: script-made clicks open nothing
    send(a.getAttribute("href"), (a.textContent || "") + " " + (a.getAttribute("aria-label") || a.getAttribute("alt") || ""), a.hasAttribute("download"));
  }
  window.addEventListener("click", onClick, true);
  var pendingTap = null;
  window.addEventListener("pointerup", function (e) {
    if (!e.isTrusted || e.pointerType !== "touch") return;
    var t = e.target, btn = t && t.closest ? t.closest("#dt-cb button") : null;
    if (btn) {
      clearTimeout(pendingTap && pendingTap.timer);
      pendingTap = { btn: btn, timer: setTimeout(function () { var p = pendingTap; pendingTap = null; if (p && p.btn.isConnected) p.btn.click(); }, 350) };
      return;
    }
    try { window.dispatchEvent(new PointerEvent("pointermove", { pointerType: "mouse", clientX: e.clientX, clientY: Math.max(0, window.innerHeight - 1), buttons: 0 })); } catch (x) { /* no PointerEvent */ }
  }, true);
  window.addEventListener("click", function (e) {
    if (pendingTap && e.isTrusted && e.target && e.target.closest && e.target.closest("#dt-cb button") === pendingTap.btn) { clearTimeout(pendingTap.timer); pendingTap = null; }
  }, true);
  window.addEventListener("auxclick", onClick, true);
  // The player's own window.open (after its confirmation box, presenter view): no popups here; ask the page instead
  window.open = function (u) { if (u != null && !/[?&]presenter=1/.test(String(u)) && navigator.userActivation && navigator.userActivation.isActive) send(u, ""); return null; };
})();
