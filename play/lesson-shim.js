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
//   3. The navigation keys pressed in the page, handed over by it (below).
//   4. Fullscreen: the frame has no fullscreen permission (play/frame.mjs), so the player's own requestFullscreen() on its document
//      would be refused. The fullscreen API of this document is replaced by one that asks the page {egaViewer: "fullscreen", on},
//      and the page puts the frame element itself into fullscreen (or leaves it) and reports {egaViewer: "fullscreen-state", on,
//      enabled, refused?}. The getters (fullscreenElement, fullscreenEnabled and the webkit names) and the fullscreenchange events
//      follow that state, so any player version inside the file (one that knows only the unprefixed API, too) shows its button right.
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
  window.addEventListener("auxclick", onClick, true);
  // The player's own window.open (after its confirmation box, presenter view): no popups here; ask the page instead
  window.open = function (u) { if (u != null && !/[?&]presenter=1/.test(String(u)) && navigator.userActivation && navigator.userActivation.isActive) send(u, ""); return null; };
  // 3. Keys pressed while the focus is on the page (its bar, its buttons, the Live pane), or while the frame does not have it
  //    (the page's iframe.focus() is refused or lost: Chrome before the lesson has loaded, Safari): the page hands the navigation
  //    keys over as {egaViewer: "key", key, shift} (play/main.js), and this presses them the way the player's own buttons do
  //    (kit/tools.js press(): a keydown on the document), so it works with any player version inside the file.
  //    Only from the page, only these keys.
  var NAV = /^(ArrowRight|ArrowLeft|ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/;
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== parentWin || !m || m.egaViewer !== "key" || typeof m.key !== "string" || !NAV.test(m.key)) return;
    try { document.dispatchEvent(new KeyboardEvent("keydown", { key: m.key, shiftKey: m.shift === true, bubbles: true, cancelable: true })); } catch (x) { /* an old browser */ }
  });
  // 4. Fullscreen through the page. Until the page reports (when the frame has loaded), it is available when this browser has
  //    element fullscreen at all (iPhone Safari has none: the player then hides its button). Requests made by lesson script
  //    without the viewer's activation are refused by the browser in the page, as they would be here.
  var EP = Element.prototype, DP = Document.prototype, noop = function () {};
  var FS = { on: false, enabled: typeof EP.requestFullscreen === "function" || typeof EP.webkitRequestFullscreen === "function", waitOn: [], waitOff: [] };
  function fire(type) {
    try { document.documentElement.dispatchEvent(new Event(type, { bubbles: true, composed: true })); } catch (x) { /* an old browser */ }
  }
  function settle(list, ok, err) {
    var w = list.splice(0, list.length);
    for (var i = 0; i < w.length; i++) { clearTimeout(w[i][2]); if (ok) w[i][0](); else w[i][1](err); }
  }
  function ask(on) {
    return new Promise(function (resolve, reject) {
      if (on === FS.on) { resolve(); return; }
      if (on && !FS.enabled) { reject(new TypeError("Fullscreen is not available")); fire("fullscreenerror"); return; }
      var list = on ? FS.waitOn : FS.waitOff, w = [resolve, reject, 0];
      w[2] = setTimeout(function () { var j = list.indexOf(w); if (j >= 0) { list.splice(j, 1); reject(new TypeError("Fullscreen request timed out")); } }, 5000);
      list.push(w);
      try { parentWin.postMessage({ egaViewer: "fullscreen", on: on }, "*"); } catch (x) { settle(list, false, new TypeError("Fullscreen request failed")); }
    });
  }
  function method(o, name, fn) { try { Object.defineProperty(o, name, { configurable: true, writable: true, enumerable: true, value: fn }); } catch (x) { /* kept */ } }
  function getter(o, name, fn) { try { Object.defineProperty(o, name, { configurable: true, enumerable: true, get: fn }); } catch (x) { /* kept */ } }
  method(EP, "requestFullscreen", function () { return ask(true); });
  method(EP, "webkitRequestFullscreen", function () { ask(true).catch(noop); });
  method(EP, "webkitRequestFullScreen", function () { ask(true).catch(noop); });
  method(DP, "exitFullscreen", function () { return ask(false); });
  method(DP, "webkitExitFullscreen", function () { ask(false).catch(noop); });
  method(DP, "webkitCancelFullScreen", function () { ask(false).catch(noop); });
  var element = function () { return FS.on ? document.documentElement : null; }, enabled = function () { return FS.enabled; }, on = function () { return FS.on; };
  getter(DP, "fullscreenElement", element); getter(DP, "webkitFullscreenElement", element); getter(DP, "webkitCurrentFullScreenElement", element);
  getter(DP, "fullscreenEnabled", enabled); getter(DP, "webkitFullscreenEnabled", enabled);
  getter(DP, "fullscreen", on); getter(DP, "webkitIsFullScreen", on);
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== parentWin || !m || m.egaViewer !== "fullscreen-state" || typeof m.on !== "boolean" || typeof m.enabled !== "boolean") return;
    FS.enabled = m.enabled;
    if (m.on !== FS.on) {
      FS.on = m.on;
      fire("fullscreenchange"); fire("webkitfullscreenchange");
    }
    settle(FS.on ? FS.waitOn : FS.waitOff, true);
    if (m.refused === true) {
      settle(FS.waitOn, false, new TypeError("Fullscreen request denied"));
      fire("fullscreenerror"); fire("webkitfullscreenerror");
    }
  });
})();
