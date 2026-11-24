// Egatari Viewer: the frame made only to print a learner's notes as a handout (handoff #107, annotations.md Note record: printing is
// the one case where notes go into a file's frame). The page makes this frame when 「PDF」 is pressed and removes it when printing
// ends: sandbox "allow-scripts allow-modals" (print() needs allow-modals; the frame that plays the lesson never has it), the same
// policy as the playing frame (connect-src 'none': nothing in it can send the notes anywhere), off screen.
// This script is the frame's whole trusted prefix (the lesson shim and the markup script are not in it: nothing here plays). Steps:
//   1. when the player is ready, it tells the page {egaViewer: "print-ready"}
//   2. the page sends {egaViewer: "print", pages: [{slide, blocks, ink}], sections: [{title, blocks}], all, words: {...}, title}
//   3. each slide is laid out with the player's own print style (kit/base.css: every step shown), smaller, on an A4 page, with its
//      memo area under it: the typed note at the same size relative to the slide as on screen (so handwriting over it stays where
//      it was drawn), the quotes as quotes, and the handwriting as SVG over the slide and the memo area. Slides without a note are
//      left out unless `all`. The notes on sections of the book come at the end.
//   4. it prints (the browser's own dialog: 「PDF に保存」), and tells the page {egaViewer: "print-done"} after.
// Every value from the page is read as data: text goes in as text (textContent), stroke points as numbers.
(function printFrame() {
  "use strict";
  var parentWin = window.parent, W = 1280, H = 720, GAP = 12, MEMO = 468, K = 0.55, FONT = 26;
  function post(m) { try { parentWin.postMessage(m, "*"); } catch (e) { /* gone */ } }
  // nothing here plays: no fullscreen (the player asks whether it may; WebKit reports a refused permission check as an error)
  (function noFullscreen() {
    var off = function () { return false; }, none = function () { return null; }, no = function () { return Promise.reject(new TypeError("Fullscreen is not available")); };
    var def = function (o, n, d) { try { Object.defineProperty(o, n, d); } catch (x) { /* kept */ } };
    ["fullscreenEnabled", "webkitFullscreenEnabled"].forEach(function (n) { def(Document.prototype, n, { configurable: true, get: off }); });
    ["fullscreenElement", "webkitFullscreenElement", "webkitCurrentFullScreenElement"].forEach(function (n) { def(Document.prototype, n, { configurable: true, get: none }); });
    ["requestFullscreen", "webkitRequestFullscreen", "webkitRequestFullScreen"].forEach(function (n) { def(Element.prototype, n, { configurable: true, writable: true, value: no }); });
  })();
  var SHADE = { k: "#1f1f1f", r: "#d22a3a", b: "#1f5fbf" };
  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  // strokes {c, p: [x, y, pressure, …]} → one SVG, over the part y0…y0+h of the surface
  function svgOf(strokes, y0, h) {
    var NS = "http://www.w3.org/2000/svg", s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", "0 " + y0 + " " + W + " " + h); s.setAttribute("class", "ega-pink");
    (strokes || []).forEach(function (st) {
      if (!st || !Array.isArray(st.p) || st.p.length < 3) return;
      var d = "", p = st.p;
      for (var i = 0; i + 2 < p.length; i += 3) d += (i ? "L" : "M") + num(p[i]).toFixed(1) + " " + num(p[i + 1]).toFixed(1);
      if (p.length === 3) d += "l0.1 0";
      var path = document.createElementNS(NS, "path");
      path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", SHADE[st.c] || SHADE.r);
      path.setAttribute("stroke-width", "3.5"); path.setAttribute("stroke-linecap", "round"); path.setAttribute("stroke-linejoin", "round");
      s.appendChild(path);
    });
    return s;
  }
  function blocksEl(blocks, cls) {
    var box = document.createElement("div"); box.className = cls;
    (blocks || []).forEach(function (b) {
      if (b && typeof b.text === "string") { var p = document.createElement("p"); p.textContent = b.text; box.appendChild(p); }
      else if (b && b.quote && typeof b.quote.exact === "string") { var q = document.createElement("blockquote"); q.textContent = b.quote.exact; box.appendChild(q); }
    });
    return box;
  }
  var CSS = "@media print{@page{size:A4 portrait;margin:12mm}" +
    "html,body{background:#fff!important}" +
    "#stage>.slide{zoom:" + K + ";box-shadow:0 0 0 2px #aaa;break-after:auto!important;page-break-after:auto!important;break-inside:avoid;margin:0 auto}" +
    "#stage>.slide.ega-off,#stage>.ega-pmemo.ega-off{display:none!important}" +
    ".ega-pmemo{position:relative;width:" + Math.round(W * K) + "px;margin:" + Math.round(GAP * K) + "px auto 0;break-after:page;page-break-after:always;font-family:system-ui,-apple-system,'Hiragino Sans','Yu Gothic',sans-serif;color:#1f1f1f}" +
    ".ega-pmemo .ega-area{position:relative;box-sizing:border-box;min-height:" + Math.round(MEMO * K) + "px;border:1px solid #999;padding:" + (0.6 * FONT * K).toFixed(1) + "px " + (0.8 * FONT * K).toFixed(1) + "px;font-size:" + (FONT * K).toFixed(2) + "px;line-height:1.55}" +
    ".ega-pmemo p,.ega-sec p{margin:0 0 .4em;white-space:pre-wrap}.ega-pmemo blockquote,.ega-sec blockquote{margin:0 0 .4em;padding:.3em .6em;border-left:.25em solid #e0b400;background:#f4f4f4;white-space:pre-wrap}" +
    ".ega-pmemo .ega-head{font-size:11px;color:#555;margin:0 0 4px}" +
    ".ega-pmemo svg.ega-pink{position:absolute;left:0;top:0;width:100%;height:" + Math.round(MEMO * K) + "px;pointer-events:none}" +
    ".slide>svg.ega-pink{position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;z-index:2147483000;pointer-events:none}" +
    ".ega-secs{font-family:system-ui,-apple-system,'Hiragino Sans','Yu Gothic',sans-serif;color:#1f1f1f;font-size:12pt;line-height:1.6}.ega-secs h1{font-size:15pt}.ega-secs h2{font-size:12.5pt;margin:1.2em 0 .4em}" +
    "#deck-text,#deck-split,#deck-readin,#deck-backplay,#deck-ov,#deck-layouts{display:none!important}}";

  function layout(m) {
    var stage = document.getElementById("stage");
    if (!stage) return false;
    var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
    var pages = {};
    (Array.isArray(m.pages) ? m.pages : []).forEach(function (pg) { if (pg && typeof pg.slide === "string") pages[pg.slide] = pg; });
    var words = m.words && typeof m.words === "object" ? m.words : {};
    var slides = [].slice.call(stage.querySelectorAll(":scope > .slide")), n = 0;
    slides.forEach(function (sl, i) {
      var key = String(sl._key || sl.getAttribute("data-key") || sl.id || "s" + (i + 1)), pg = pages[key];
      var has = !!pg && ((pg.blocks && pg.blocks.length) || (pg.ink && pg.ink.length));
      var memo = document.createElement("div"); memo.className = "ega-pmemo";
      var head = document.createElement("p"); head.className = "ega-head"; head.textContent = typeof words.slide === "string" ? words.slide.replace("{n}", String(i + 1)) : String(i + 1);
      var area = blocksEl(pg && pg.blocks, "ega-area");
      memo.appendChild(head); memo.appendChild(area);
      // the handwriting: all of it in two SVGs, each showing its own part of the surface (an SVG clips to its viewBox), so a stroke
      // from the memo up into the slide is drawn in both
      if (pg && pg.ink && pg.ink.length) { sl.appendChild(svgOf(pg.ink, 0, H)); area.appendChild(svgOf(pg.ink, H + GAP, MEMO)); }
      if (!has && !m.all) { sl.classList.add("ega-off"); memo.classList.add("ega-off"); }
      else n++;
      stage.insertBefore(memo, sl.nextSibling);
    });
    var secs = Array.isArray(m.sections) ? m.sections : [];
    if (secs.length) {
      var box = document.createElement("div"); box.className = "ega-secs";
      var h1 = document.createElement("h1"); h1.textContent = typeof words.sections === "string" ? words.sections : ""; box.appendChild(h1);
      secs.forEach(function (s) {
        if (!s) return;
        var h2 = document.createElement("h2"); h2.textContent = typeof s.title === "string" ? s.title : ""; box.appendChild(h2);
        box.appendChild(blocksEl(s.blocks, "ega-sec"));
      });
      document.body.appendChild(box);
    }
    if (typeof m.title === "string") document.title = m.title;
    return n + secs.length > 0;
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== parentWin || !m || m.egaViewer !== "print") return;
    var ok = false;
    try { ok = layout(m); } catch (x) { ok = false; }
    if (!ok) { post({ egaViewer: "print-done", empty: true }); return; }
    window.addEventListener("afterprint", function () { post({ egaViewer: "print-done" }); }, { once: true });
    // the fonts and images of the lesson first
    var go = function () { setTimeout(function () { try { window.print(); } catch (x) { post({ egaViewer: "print-done", failed: true }); } }, 300); };
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(go, go); else go();
  });
  // ready: the player has built the slides (kit/deck.js DECK.ready), or the document has loaded with no player
  var tries = 0;
  (function wait() {
    if ((window.DECK && window.DECK.ready) || (document.readyState === "complete" && tries > 50)) { post({ egaViewer: "print-ready" }); return; }
    tries++; setTimeout(wait, 100);
  })();
})();
