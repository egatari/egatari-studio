// Egatari Viewer: the frame that lays out the slides for a learner's notes printed as a handout (handoff #107). The page makes this
// frame when 「PDF」 is pressed and removes it when printing ends. Its sandbox is "allow-scripts" only, like the frame that plays the
// lesson, with the same policy (connect-src 'none'). It never prints and never gets the notes: the page draws the notes and the
// handwriting itself and calls print() (standards 11/27: on an iPad, print() in a frame prints the whole page, so only the page prints).
// This script is the frame's whole trusted prefix (the lesson shim and the markup script are not in it: nothing here plays).
//   1. when the player is ready, it tells the page {egaViewer: "print-ready"}
//   2. {egaViewer: "print-snap", slides: [key…]}: a still copy of each slide. It answers
//      {egaViewer: "print-snaps", css, html: {key: "<html…>"}, attrs}: the document's styles, each slide's HTML at its last step
//      (a canvas as an image), the attributes of <html>, <body> and the stage. The page checks them and puts each copy in a frame
//      with sandbox="" (no scripts at all).
// Every value from the page is read as data.
(function printFrame() {
  "use strict";
  var parentWin = window.parent, W = 1280, H = 720;
  function post(m) { try { parentWin.postMessage(m, "*"); } catch (e) { /* gone */ } }
  // nothing here plays: no fullscreen (the player asks whether it may; WebKit reports a refused permission check as an error)
  (function noFullscreen() {
    var off = function () { return false; }, none = function () { return null; }, no = function () { return Promise.reject(new TypeError("Fullscreen is not available")); };
    var def = function (o, n, d) { try { Object.defineProperty(o, n, d); } catch (x) { /* kept */ } };
    ["fullscreenEnabled", "webkitFullscreenEnabled"].forEach(function (n) { def(Document.prototype, n, { configurable: true, get: off }); });
    ["fullscreenElement", "webkitFullscreenElement", "webkitCurrentFullScreenElement"].forEach(function (n) { def(Document.prototype, n, { configurable: true, get: none }); });
    ["requestFullscreen", "webkitRequestFullscreen", "webkitRequestFullScreen"].forEach(function (n) { def(Element.prototype, n, { configurable: true, writable: true, value: no }); });
  })();
  // the player's print style (kit/base.css @media print), also on screen: every step shown, nothing moving
  var LAST = "[data-step]{opacity:1!important;transform:none!important;transition:none!important;animation:none!important}" +
    ".draw{stroke-dashoffset:0!important}*{transition:none!important;animation-play-state:paused!important}" +
    "#bar,#jump,.edit-ui,svg.marks,#deck-cap,#deck-toast,#deck-back,#deck-extlink,#deck-black,#deck-black-hint,#pv-tap,.sr-only," +
    "#deck-text,#deck-split,#deck-readin,#deck-backplay,#deck-ov,#deck-layouts{display:none!important}";
  function keyOf(sl, i) { return String(sl._key || sl.getAttribute("data-key") || sl.id || "s" + (i + 1)); }
  function slides() { var st = document.getElementById("stage"); return st ? [].slice.call(st.querySelectorAll(":scope > .slide")) : []; }
  function wanted(m) { var w = {}; (Array.isArray(m.slides) ? m.slides : []).forEach(function (k) { if (typeof k === "string") w[k] = 1; }); return w; }

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function attrsOf(el) {
    var o = {};
    if (!el) return o;
    for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (!/^on/i.test(a.name)) o[a.name] = a.value; }
    return o;
  }
  function cssOf() {
    var out = [];
    var add = function (sheet) { try { var r = sheet.cssRules, t = ""; for (var i = 0; i < r.length; i++) t += r[i].cssText + "\n"; out.push(t); } catch (x) { if (sheet.ownerNode && sheet.ownerNode.textContent) out.push(sheet.ownerNode.textContent); } };
    [].forEach.call(document.styleSheets, add);
    (document.adoptedStyleSheets || []).forEach(add);
    return out.join("\n");
  }
  // an image the copy can show: a canvas as a PNG, an image from a blob: address (this frame's own, which the copy cannot reach) as data
  function dataOf(el) {
    try {
      if (el.localName === "canvas") return el.toDataURL("image/png");
      var c = document.createElement("canvas"); c.width = el.naturalWidth; c.height = el.naturalHeight;
      if (!c.width || !c.height) return "";
      c.getContext("2d").drawImage(el, 0, 0); return c.toDataURL("image/png");
    } catch (x) { return ""; }
  }
  function snapOf(sl) {
    var clone = sl.cloneNode(true), a = sl.querySelectorAll("canvas, img"), b = clone.querySelectorAll("canvas, img");
    for (var i = 0; i < a.length && i < b.length; i++) {
      var o = a[i], c = b[i];
      if (o.localName === "canvas") {
        var img = document.createElement("img"), r = o.getBoundingClientRect();
        img.src = dataOf(o); img.setAttribute("style", (o.getAttribute("style") || "") + ";width:" + (o.style.width || o.width + "px") + ";height:" + (o.style.height || o.height + "px"));
        if (o.className) img.setAttribute("class", typeof o.className === "string" ? o.className : o.getAttribute("class"));
        c.parentNode.replaceChild(img, c); void r;
      } else if (/^blob:/.test(o.currentSrc || o.src || "")) { c.setAttribute("src", dataOf(o)); c.removeAttribute("srcset"); }
    }
    clone.querySelectorAll("script, iframe, object, embed").forEach(function (x) { x.remove(); });
    // what the player keeps only in properties: form values and the slide being on screen
    var ia = sl.querySelectorAll("input, textarea, select"), ib = clone.querySelectorAll("input, textarea, select");
    for (var j = 0; j < ia.length && j < ib.length; j++) {
      if (ia[j].type === "checkbox" || ia[j].type === "radio") { if (ia[j].checked) ib[j].setAttribute("checked", ""); }
      else if (ia[j].localName === "textarea") ib[j].textContent = ia[j].value;
      else if (ia[j].localName !== "select") ib[j].setAttribute("value", ia[j].value);
    }
    clone.classList.add("active");
    return clone.outerHTML;
  }
  function snap(m) {
    var w = wanted(m), html = {}, n = 0;
    slides().forEach(function (sl, i) { var k = keyOf(sl, i); if (w[k]) { html[k] = snapOf(sl); n++; } });
    return { egaViewer: "print-snaps", n: n, css: cssOf() + "\n" + LAST, html: html,
      attrs: { html: attrsOf(document.documentElement), body: attrsOf(document.body), stage: attrsOf(document.getElementById("stage")) } };
  }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== parentWin || !m || typeof m !== "object") return;
    if (m.egaViewer === "print-snap") {
      var go = function () { var r; try { r = snap(m); } catch (x) { r = { egaViewer: "print-snaps", n: 0, css: "", html: {}, attrs: {} }; } post(r); };
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go); else go();
    }
  });
  // ready: the player has built the slides (kit/deck.js DECK.ready), or the document has loaded with no player
  var tries = 0;
  (function wait() {
    if ((window.DECK && window.DECK.ready) || (document.readyState === "complete" && tries > 50)) { post({ egaViewer: "print-ready" }); return; }
    tries++; setTimeout(wait, 100);
  })();
})();
