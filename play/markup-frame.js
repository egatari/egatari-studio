// Egatari Viewer: markup inside the lesson's frame (stage 1: highlights in the book, and 暗記). Part of the page's trusted
// prefix, after play/lesson-shim.js (tools/build-play.mjs). It runs in the sandboxed frame with no more power than the lesson,
// and the page keeps the highlights (play/markup.mjs): this script only paints what the page sends and asks the page for changes.
//   - Painting: boxes in this script's own layer inside the book's scrolling box (below, "painting"). The book's text and markup
//     are never changed; the layer is one element added after the article.
//   - Anchors (egatari-spec annotations.md, Highlight record): the data-section-id of the article section ("" outside any section)
//     and a text quote {exact, prefix, suffix} of the rendered text, so a highlight survives a new font size, line spacing,
//     background or page layout, and small edits of the lesson. Ruby readings (rt, rp) and KaTeX's hidden MathML are not text here.
//   - The small window next to a selection (or a tapped highlight): three colours, and 消す on a highlight. Above it with a mouse,
//     below a selection on a touch screen (iPad's own callout is above it).
//   - 暗記: an opaque band of the colour over the text of the chosen colours; a tap reveals one highlight.
// Messages (all {egaViewer: "markup-…"}; the page checks every one):
//   to the page   hello {supported, article}  add {color, target}  set {id, color}  del {id}  status {missing:[id], sections:{id: title}}  esc
//   from the page load {list, words, view}  view {view}  jump {id}
//     view = {hidden: ["y"…], recall: bool, recallColors: ["y"…], bar: bool}
(function markupFrame() {
  "use strict";
  var parentWin = window.parent;
  var COLORS = ["y", "p", "b"], ID_RE = /^h-[0-9a-f]{1,32}$/;
  var MAXQ = 1000, CTX = 32;
  var supported = typeof Range === "function" && typeof Range.prototype.getClientRects === "function" && typeof Element.prototype.attachShadow === "function";
  function post(m) { m.egaViewer = "markup-" + m.egaViewer; try { parentWin.postMessage(m, "*"); } catch (e) { /* gone */ } }

  var S = { list: [], placed: {}, view: { hidden: [], recall: false, recallColors: COLORS.slice(), bar: false }, revealed: {}, words: null, article: null };

  // ---------------------------------------------------------------- the text of a part, without ruby readings or hidden MathML
  var SKIP = "rt,rp,.katex-mathml,script,style,template,noscript";
  function textOf(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentElement; return p && p.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
    var nodes = [], starts = [], s = "", n;
    while ((n = w.nextNode())) { nodes.push(n); starts.push(s.length); s += n.data; }
    return { text: s, nodes: nodes, starts: starts };
  }
  // a DOM point → an offset in T (a point in a skipped node goes to the next counted text)
  function offsetOf(T, node, off) {
    for (var i = 0; i < T.nodes.length; i++) {
      var n = T.nodes[i];
      if (n === node) return T.starts[i] + Math.min(off, n.data.length);
      var pos = node.compareDocumentPosition ? node.compareDocumentPosition(n) : 0;
      if (node.nodeType === 1 && node.childNodes[off] && (node.childNodes[off] === n || node.childNodes[off].contains(n))) return T.starts[i];
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING && !(pos & Node.DOCUMENT_POSITION_CONTAINED_BY)) return T.starts[i];
    }
    return T.text.length;
  }
  function rangeAt(T, a, b) {
    var r = document.createRange(), sa = null, sb = null;
    for (var i = 0; i < T.nodes.length; i++) {
      var st = T.starts[i], en = st + T.nodes[i].data.length;
      if (!sa && a < en) sa = [T.nodes[i], a - st];
      if (b <= en && b > st) { sb = [T.nodes[i], b - st]; break; }
    }
    if (!sa || !sb) return null;
    r.setStart(sa[0], sa[1]); r.setEnd(sb[0], sb[1]);
    return r;
  }
  function sectionOf(node) { var e = node.nodeType === 1 ? node : node.parentElement, s = e && e.closest("section[data-section-id]"); return s && S.article.contains(s) ? s : null; }
  function sectionEl(id) { if (!id) return null; var all = S.article.querySelectorAll("section[data-section-id]"); for (var i = 0; i < all.length; i++) if (all[i].getAttribute("data-section-id") === id) return all[i]; return null; }

  // ---------------------------------------------------------------- a selection → a target
  function targetOf(range) {
    var a = S.article;
    if (!a || !a.contains(range.commonAncestorContainer)) return null;
    var sec = sectionOf(range.startContainer), secEnd = sectionOf(range.endContainer);
    var root = sec && sec === secEnd ? sec : a, id = root === a ? "" : sec.getAttribute("data-section-id");
    var T = textOf(root), s = offsetOf(T, range.startContainer, range.startOffset), e = offsetOf(T, range.endContainer, range.endOffset);
    while (s < e && /\s/.test(T.text.charAt(s))) s++;
    while (e > s && /\s/.test(T.text.charAt(e - 1))) e--;
    if (e <= s || e - s > MAXQ) return null;
    return { section: id, quote: { exact: T.text.slice(s, e), prefix: T.text.slice(Math.max(0, s - CTX), s), suffix: T.text.slice(e, e + CTX) } };
  }
  // ---------------------------------------------------------------- a target → a range (annotations.md: section, prefix/suffix, whole article)
  function common(a, b, fromEnd) { var n = 0, l = Math.min(a.length, b.length); while (n < l && (fromEnd ? a.charAt(a.length - 1 - n) === b.charAt(b.length - 1 - n) : a.charAt(n) === b.charAt(n))) n++; return n; }
  function findIn(root, q) {
    if (!root) return null;
    var T = textOf(root), best = -1, score = -1, i = T.text.indexOf(q.exact);
    while (i >= 0) {
      var sc = common(T.text.slice(Math.max(0, i - CTX), i), q.prefix || "", true) + common(T.text.slice(i + q.exact.length, i + q.exact.length + CTX), q.suffix || "", false);
      if (sc > score) { score = sc; best = i; }
      i = T.text.indexOf(q.exact, i + 1);
    }
    return best < 0 ? null : rangeAt(T, best, best + q.exact.length);
  }
  function anchor(h) { return findIn(sectionEl(h.target.section), h.target.quote) || findIn(S.article, h.target.quote); }

  // ---------------------------------------------------------------- painting: this script's own layer inside the book's scrolling box
  // Highlights are boxes in a layer (a shadow tree, so the lesson's styles cannot reach it) placed in the book's scrolling box
  // (.dx-body, position: relative), so they scroll with the text with no delay. They are blended with the text (multiply on a light
  // page, screen on black), so the text reads as under a marker, and they let taps and selections through.
  // Not the CSS Custom Highlight API: Safari (iPad) never paints it on ruby bases, and leaves old paint on screen after a highlight is
  // deleted or recoloured until something else repaints.
  // 暗記: an opaque band of the highlight's colour over the text (also covering ruby and emphasis marks (傍点)); a tap on it reveals
  // that highlight. Each hidden highlight also has a button for the keyboard (Tab in reading order, after the book's own links;
  // Enter or Space reveals; the focus ring is on its first line), and the browser scrolls a focused one into view.
  var hidden = function (c) { return S.view.hidden.indexOf(c) >= 0; };
  var masked = function (h) { return S.view.recall && S.view.recallColors.indexOf(h.color) >= 0 && !S.revealed[h.id]; };
  var BAND = { white: { y: "#fff066", p: "#ff9eb0", b: "#79b8ff" }, sepia: { y: "#f5e04a", p: "#f797a8", b: "#70aae6" }, black: { y: "#7d6800", p: "#a5304a", b: "#1f4f94" } };
  var LAYER_CSS = "@media print{:host{display:none!important}}" +   // stage 1 prints the book as it is; export (stage 2) draws highlights on purpose
    ".h{position:absolute;pointer-events:none;border-radius:2px}.h.mul{mix-blend-mode:multiply}.h.scr{mix-blend-mode:screen}" +
    ".m{position:absolute;border-radius:2px;cursor:pointer;-webkit-tap-highlight-color:transparent;pointer-events:auto}" +
    ".k{all:unset;position:absolute;z-index:1;cursor:pointer;border-radius:2px;pointer-events:auto;-webkit-tap-highlight-color:transparent}.k:focus-visible{outline:3px solid #2c63d4;outline-offset:2px;box-shadow:0 0 0 5px #fff}";
  var L = { host: null, root: null, paint: null, mk: null };
  function layer() {
    var a = S.article, sc = a && (a.closest(".dx-body") || a.parentElement);
    if (!sc) return null;
    if (!L.host) {
      L.host = document.createElement("div");
      L.host.setAttribute("data-egatari-viewer", "layer");
      L.host.setAttribute("aria-hidden", "false");
      // no z-index, opacity, transform or isolation here: any of them makes the layer its own stacking context, and then the
      // blended boxes mix with nothing instead of the text under them (Safari on an iPad then showed solid colour over the text).
      // Positioned and after the article, the layer still paints over the text
      L.host.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none;margin:0;padding:0;border:0;isolation:auto";
      L.root = L.host.attachShadow({ mode: "open" });
      var st = document.createElement("style"); st.textContent = LAYER_CSS;
      L.paint = document.createElement("div"); L.paint.setAttribute("aria-hidden", "true");
      L.mk = document.createElement("div"); L.mk.className = "mk";
      L.root.appendChild(st); L.root.appendChild(L.paint); L.root.appendChild(L.mk);
      L.root.addEventListener("click", function (e) {
        var m = e.target.closest ? e.target.closest(".k,.g") : null;
        if (!m || !e.isTrusted) return;
        e.preventDefault(); e.stopPropagation();
        reveal(m.getAttribute("data-id"));
      });
    }
    if (L.host.parentNode !== sc) sc.appendChild(L.host);
    return L;
  }
  // emphasis marks (傍点) are drawn outside the text's box: above it, or to its right in vertical writing. How far a band must reach
  function emphasisOf(r) {
    var top = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement, list = [top].concat(Array.prototype.slice.call(top.querySelectorAll("*")));
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e !== top && !r.intersectsNode(e)) continue;
      var c = getComputedStyle(e), st = c.textEmphasisStyle || c.webkitTextEmphasisStyle || "none";
      if (st && st !== "none") return { size: parseFloat(c.fontSize) * 0.6, vertical: /^vertical/.test(c.writingMode) };
    }
    return null;
  }
  // The boxes of the text in a range, line by line. Not Range.getClientRects() alone: it also returns the box of every element the
  // range wholly contains (an <em>, a ruby), which would paint those parts twice. Text in the hidden MathML is left out
  function textRects(r) {
    var out = [], root = r.commonAncestorContainer;
    var push = function (n, a, b) { var x = document.createRange(); x.setStart(n, a); x.setEnd(n, b); var rs = x.getClientRects(); for (var i = 0; i < rs.length; i++) if (rs[i].width >= 0.5 && rs[i].height >= 0.5) out.push(rs[i]); };
    if (root.nodeType === 3) { push(root, r.startOffset, r.endOffset); return out; }
    // from the range's first text node to its last only (walking the whole section for each highlight is slow at 2000)
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n = r.startContainer;
    if (n.nodeType !== 3) { var c = n.childNodes[r.startOffset]; w.currentNode = c || n; n = c && c.nodeType === 3 ? c : w.nextNode(); }
    else w.currentNode = n;
    var endNode = r.endContainer.nodeType === 3 ? r.endContainer : null;
    for (; n; n = w.nextNode()) {
      if (!endNode && !r.intersectsNode(n)) break;
      var p = n.parentElement;
      if (!(p && p.closest(".katex-mathml"))) {
        var a = n === r.startContainer ? r.startOffset : 0, b = n === r.endContainer ? r.endOffset : n.data.length;
        if (b > a && n.data.slice(a, b).trim()) push(n, a, b);
      }
      if (n === endNode) break;
    }
    return out;
  }
  var MK = {};
  function inOrder(a, b) { try { return S.placed[a].compareBoundaryPoints(Range.START_TO_START, S.placed[b]); } catch (e) { return 0; } }
  function bgName() { var pane = document.getElementById("deck-text"), v = pane && pane.getAttribute("data-dx-bg"); return v === "sepia" || v === "black" ? v : "white"; }
  // Only the highlights near the screen are drawn: the visible part of the book and half a screen before and after it. Ranges in
  // document order are in reading order on the page, so the first one in that window is found by halving (a few rects), and
  // drawing stops at the first one past it. Scrolling past half of that margin draws again (no scroll redraw otherwise: the
  // layer scrolls with the text). At the 2000 cap a full redraw was 130–160 ms in WebKit; this keeps it to what is on screen.
  var ORDER = [], WIN = null;
  function scrollerOf() { return S.article && (S.article.closest(".dx-body") || null); }
  function vertical() { try { return /^vertical/.test(getComputedStyle(S.article).writingMode); } catch (e) { return false; } }
  function nearIds(filter) {
    var sc = scrollerOf(), v = vertical(), vr = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth, width: innerWidth, height: innerHeight };
    var m = (v ? vr.width : vr.height) * 0.5;   // half a screen before and after
    // positions along the reading direction: down the page, or leftward in vertical writing
    var lo = v ? -(vr.right + m) : vr.top - m, hi = v ? -(vr.left - m) : vr.bottom + m;
    var list = ORDER.filter(function (id) { return S.placed[id] && filter(id); });
    var pos = function (id) { var b = S.placed[id].getBoundingClientRect(); return { a: v ? -b.right : b.top, z: v ? -b.left : b.bottom, empty: !b.width && !b.height }; };
    var a = 0, z = list.length;
    while (a < z) { var mid = (a + z) >> 1, q = pos(list[mid]); if (q.z < lo) a = mid + 1; else z = mid; }
    var out = [];
    for (var k = a; k < list.length; k++) { var q2 = pos(list[k]); if (q2.a > hi && !q2.empty) break; out.push(list[k]); }
    WIN = sc ? { at: v ? sc.scrollLeft : sc.scrollTop, margin: m, v: v } : null;
    return out;
  }
  function paint() {
    var Y = S.article ? layer() : null;
    if (!Y) return;
    var t0 = performance.now();
    var o = L.host.getBoundingClientRect(), bg = bgName(), blend = bg === "black" ? "scr" : "mul";
    var box = function (q, grow) { grow = grow || {}; return "left:" + (q.left - o.left) + "px;top:" + (q.top - o.top - (grow.up || 0)) + "px;width:" + (q.width + (grow.right || 0)) + "px;height:" + (q.height + (grow.up || 0)) + "px;"; };
    var byId = {}; S.list.forEach(function (h) { byId[h.id] = h; });
    var near = nearIds(function (id) { return byId[id] && !hidden(byId[id].color); });   // ORDER can be one list behind until placeAll
    // the highlights shown (not hidden by a filter, not under a 暗記 band): all reads first, then one write
    var shown = [];
    near.forEach(function (id) { var h = byId[id]; if (!masked(h)) shown.push([h, textRects(S.placed[id])]); });
    var html = "";
    for (var k = 0; k < shown.length; k++) {
      var h = shown[k][0], rs = shown[k][1];
      for (var i = 0; i < rs.length; i++) html += '<div class="h ' + blend + '" data-id="' + h.id + '" data-c="' + h.color + '" style="' + box(rs[i]) + "background:" + BAND[bg][h.color] + '"></div>';
    }
    L.paint.innerHTML = html;   // ids are checked on arrival (ID_RE), colours are y/p/b and the numbers are made here
    // 暗記: bands and buttons for the hidden highlights near the screen, kept between redraws so the keyboard's focus stays.
    // Tab moves through them in reading order; focusing the last one scrolls it into view, which draws the next ones
    var ids = S.view.recall ? near.filter(function (id) { return masked(byId[id]); }) : [];
    var keep = {}, focusedGone = false, act = L.root.activeElement;
    ids.forEach(function (id) { keep[id] = true; });
    Object.keys(MK).forEach(function (id) { if (keep[id]) return; if (act === MK[id].btn) focusedGone = true; MK[id].btn.remove(); MK[id].bands.remove(); delete MK[id]; });
    ids.forEach(function (id, n) {
      var h = byId[id], r = S.placed[id], e = MK[id];
      if (!e) {
        e = MK[id] = { btn: document.createElement("button"), bands: document.createElement("div") };
        e.btn.type = "button"; e.btn.className = "k"; e.btn.setAttribute("data-id", id);
        e.bands.className = "g"; e.bands.setAttribute("aria-hidden", "true"); e.bands.setAttribute("data-id", id);
      }
      e.btn.setAttribute("aria-label", (words().reveal || {})[h.color] || "");
      e.bands.textContent = ""; e.bands.setAttribute("data-c", h.color);
      var rs = textRects(r), em = emphasisOf(r), grow = { up: em && !em.vertical ? em.size + 2 : 2, right: em && em.vertical ? em.size : 0 }, first = null;
      for (var i = 0; i < rs.length; i++) {
        var q = rs[i];
        var d = document.createElement("div"); d.className = "m";
        d.style.cssText = box(q, grow) + "height:" + (q.height + grow.up + 2) + "px;background:" + BAND[bg][h.color];
        e.bands.appendChild(d);
        // the button (and its focus ring) covers every piece on the first line (text across inline math or an element is in pieces)
        if (!first) first = [q.left, q.top - grow.up, q.right + grow.right, q.bottom + 2];
        else if (Math.abs(q.top - grow.up - first[1]) < 6) first = [Math.min(first[0], q.left), Math.min(first[1], q.top - grow.up), Math.max(first[2], q.right + grow.right), Math.max(first[3], q.bottom + 2)];
      }
      e.btn.style.cssText = first ? "left:" + (first[0] - o.left) + "px;top:" + (first[1] - o.top) + "px;width:" + (first[2] - first[0]) + "px;height:" + (first[3] - first[1]) + "px" : "left:0;top:0;width:1px;height:1px;opacity:0";
      // reading order: move only what is out of place (moving the focused button would drop the focus)
      var at = L.mk.children[2 * n];
      if (at !== e.btn) L.mk.insertBefore(e.btn, at || null);
      if (e.btn.nextSibling !== e.bands) L.mk.insertBefore(e.bands, e.btn.nextSibling);
    });
    if (focusedGone) { var next = revealNext; revealNext = null; if (next && MK[next]) MK[next].btn.focus(); else if (ids.length) MK[ids[0]].btn.focus(); }
    L.host.setAttribute("data-ms", String(Math.round((performance.now() - t0) * 10) / 10));   // the last redraw's time (docs/viewer.md, measured)
  }
  var revealNext = null;
  function reveal(id) {
    var ids = Object.keys(MK).sort(inOrder), i = ids.indexOf(id);
    revealNext = L.root && L.root.activeElement === (MK[id] && MK[id].btn) ? ids[i + 1] || null : null;
    S.revealed[id] = true; paint();
  }
  // Enter and Space on a band's button: taken here, before the lesson's player (this script runs first, so its listener does too),
  // which would otherwise take Space for the next step
  window.addEventListener("keydown", function (e) {
    if ((e.key !== "Enter" && e.key !== " ") || !L.root) return;
    var t = e.composedPath ? e.composedPath()[0] : null;
    if (!t || !t.classList || !t.classList.contains("k") || t.getRootNode() !== L.root) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) reveal(t.getAttribute("data-id"));
  }, true);
  // the text moves without the DOM changing (font size, line spacing, width, rotation): paint again on the next frame
  var queued = false;
  function queuePaint() { if (queued || !S.article) return; queued = true; requestAnimationFrame(function () { queued = false; paint(); }); }
  var ro = typeof ResizeObserver === "function" ? new ResizeObserver(queuePaint) : null;
  // the text can also move when fonts, images or math finish loading late, or a <details> in the book opens or closes
  if (document.fonts) { try { document.fonts.ready.then(queuePaint); document.fonts.addEventListener("loadingdone", queuePaint); } catch (e) { /* old browser */ } }
  document.addEventListener("load", function (e) { if (S.article && e.target && e.target.nodeType === 1 && S.article.contains(e.target)) queuePaint(); }, true);
  document.addEventListener("toggle", function (e) { if (S.article && e.target && S.article.contains(e.target)) queuePaint(); }, true);
  function placeAll() {
    S.placed = {};
    var missing = [];
    if (S.article) S.list.forEach(function (h) { var r = anchor(h); if (r) S.placed[h.id] = r; else missing.push(h.id); });
    ORDER = Object.keys(S.placed).sort(inOrder);
    paint();
    var sections = {};
    if (S.article) Array.prototype.forEach.call(S.article.querySelectorAll("section[data-section-id]"), function (s) { var hd = s.querySelector("h2,h3"); sections[s.getAttribute("data-section-id")] = hd ? textOf(hd).text.trim().slice(0, 200) : ""; });
    post({ egaViewer: "status", missing: missing.slice(0, 2000), sections: sections });
  }
  var stale = function () { for (var id in S.placed) { var r = S.placed[id]; if (!r.startContainer.isConnected || !r.endContainer.isConnected || r.collapsed) return true; } return false; };

  // ---------------------------------------------------------------- the small window
  var host = null, root = null, pop = null, popFor = null;   // popFor: {range} for a new one, {id} for a highlight
  function words() { return S.words || { y: "黄", p: "桃", b: "青", del: "消す", window: "ハイライト" }; }
  function makePop() {
    if (host) return;
    host = document.createElement("div");
    host.setAttribute("data-egatari-viewer", "markup");
    host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647";
    root = host.attachShadow({ mode: "open" });   // open: the lesson could post the same requests anyway; tests reach the buttons
    var st = document.createElement("style");
    st.textContent = ".w{position:fixed;display:flex;gap:6px;align-items:center;padding:6px 8px;border-radius:22px;background:#2b2b33;color:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);font:14px/1 system-ui,-apple-system,sans-serif}" +
      ".w[hidden]{display:none}button{all:unset;box-sizing:border-box;min-width:32px;height:32px;border-radius:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}" +
      "button:focus-visible{outline:2px solid #fff;outline-offset:2px}.c{width:32px;border:2px solid rgba(255,255,255,.85)}.c[aria-pressed=true]{box-shadow:0 0 0 3px #fff inset}" +
      ".w.dock{gap:10px;padding:8px 12px;border-radius:30px}.x{font-size:22px;line-height:1;color:#fff;margin-left:4px}" +
      ".w.dock button{min-width:44px;height:44px;border-radius:22px}.w.dock .c{width:44px}" +
      ".y{background:#fff066}.p{background:#ff9eb0}.b{background:#79b8ff}.d{padding:0 10px;border:1px solid rgba(255,255,255,.6)}";
    pop = document.createElement("div"); pop.className = "w"; pop.setAttribute("role", "toolbar"); pop.hidden = true;
    root.appendChild(st); root.appendChild(pop);
    // keep the selection: a press on the window never takes the focus or clears it
    pop.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); });
    pop.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
    pop.addEventListener("click", function (e) { e.stopPropagation(); var b = e.target.closest ? e.target.closest("button") : null; if (b) choose(b.getAttribute("data-a")); });
    pop.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hidePop(); } });
    document.documentElement.appendChild(host);
  }
  // Where the window goes. With a mouse, and for a tapped highlight (no selection, so no system menu): just above the text.
  // For a new selection on a touch screen: docked at the bottom edge of the book's pane, or at its top edge when the selection is
  // near the bottom. iOS puts its own menu (コピー・調べる …) right above the selection when there is room and right below it
  // otherwise (seen on an iPad, 2026-11-09), so any place next to the selection was covered in one of the two cases; the edge
  // away from the selection is free in both. Android's menu also sits next to the selection.
  var touch = function () { try { return matchMedia("(pointer: coarse)").matches; } catch (e) { return false; } };
  function showPop(rect, forWhat, dock, top) {
    makePop();
    if (!host.isConnected) document.documentElement.appendChild(host);
    popFor = forWhat;
    var W = words(), cur = forWhat.id ? (S.list.filter(function (h) { return h.id === forWhat.id; })[0] || {}).color : "";
    pop.textContent = "";
    pop.setAttribute("aria-label", W.window);
    if (dock) pop.setAttribute("aria-label", W.pick || W.window);   // docked away from the text: say what it is for
    COLORS.forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.className = "c " + c; b.setAttribute("data-a", c); b.setAttribute("aria-label", W[c]); b.title = W[c]; if (forWhat.id) b.setAttribute("aria-pressed", c === cur ? "true" : "false"); pop.appendChild(b); });
    if (forWhat.id) { var d = document.createElement("button"); d.type = "button"; d.className = "d"; d.setAttribute("data-a", "del"); d.textContent = W.del; pop.appendChild(d); }
    if (dock) { var x0 = document.createElement("button"); x0.type = "button"; x0.className = "x"; x0.setAttribute("data-a", "close"); x0.setAttribute("aria-label", W.close || "×"); x0.textContent = "×"; pop.appendChild(x0); }
    pop.classList.toggle("dock", !!dock);   // finger-sized buttons (44 px) when docked for a touch selection
    pop.hidden = false;
    var pw = pop.offsetWidth, ph = pop.offsetHeight, vw = document.documentElement.clientWidth, vv = window.visualViewport, vh = vv ? Math.min(window.innerHeight, vv.height + vv.offsetTop) : window.innerHeight;
    var x = Math.max(8, Math.min(vw - pw - 8, rect.left + rect.width / 2 - pw / 2)), y;
    if (dock) {
      var sc = scrollerOf(), pr = sc ? sc.getBoundingClientRect() : { left: 0, right: vw, top: 0, bottom: vh };
      x = Math.max(8, Math.min(vw - pw - 8, (Math.max(pr.left, 0) + Math.min(pr.right, vw)) / 2 - pw / 2));
      var lo = Math.min(pr.bottom, vh) - safeBottom() - ph - 16, hi = Math.max(pr.top, 0) + 16;
      lo = clearOf(x, lo, pw, ph, sc);   // above the player's own bar or captions when they are shown there
      y = rect.bottom + 72 > lo ? hi : lo;   // 72: the selection handle and the system menu below the selection
      if (y === hi && (top || rect).top - 72 < hi + ph) y = lo;   // a selection filling the pane: keep the bottom
    } else { y = rect.top - ph - 12; if (y < 8) y = rect.bottom + 12; }
    y = Math.max(8, Math.min(vh - ph - 8, y));
    pop.style.left = Math.round(x) + "px"; pop.style.top = Math.round(y) + "px";
  }
  function hidePop() { if (pop) pop.hidden = true; popFor = null; }
  // the bottom safe area (the Home Screen app's home indicator), as the frame sees it
  function safeBottom() {
    var p = document.createElement("div"); p.style.cssText = "position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none";
    root.appendChild(p); var v = p.offsetHeight || 0; p.remove(); return v;
  }
  // Something of the lesson's own at the docking place (the player's bar, captions): go above it. What is there is found by asking
  // the page what lies at the window's corners, not by the player's element names, so any player version is covered
  function clearOf(x, y, pw, ph, sc) {
    pop.style.visibility = "hidden";
    for (var tries = 0; tries < 4; tries++) {
      var over = null, pts = [[x + 4, y + 4], [x + pw - 4, y + 4], [x + 4, y + ph - 4], [x + pw - 4, y + ph - 4], [x + pw / 2, y + ph / 2]];
      for (var i = 0; i < pts.length && !over; i++) {
        var e = document.elementFromPoint(pts[i][0], pts[i][1]);
        if (e && e !== host && sc && !sc.contains(e) && !(L.host && e === L.host)) over = e;
      }
      if (!over) break;
      y = over.getBoundingClientRect().top - ph - 8;
    }
    pop.style.visibility = "";
    return y;
  }
  function choose(a) {
    var f = popFor;
    if (!f) return;
    if (a === "close") { dismissed = f.target ? JSON.stringify(f.target) : null; hidePop(); return; }   // the selection stays
    if (f.id) {
      if (a === "del") post({ egaViewer: "del", id: f.id });
      else if (COLORS.indexOf(a) >= 0) post({ egaViewer: "set", id: f.id, color: a });
    } else if (COLORS.indexOf(a) >= 0 && f.target) {
      post({ egaViewer: "add", color: a, target: f.target });
      try { window.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    }
    hidePop();
  }

  // ---------------------------------------------------------------- selecting text in the book
  var selTimer = 0, dismissed = null;
  document.addEventListener("selectionchange", function () {
    clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      if (!S.article || !supported) return;
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { if (popFor && !popFor.id) hidePop(); return; }
      var r = sel.getRangeAt(0), t = targetOf(r);
      if (!t) { if (popFor && !popFor.id) hidePop(); return; }
      if (dismissed === JSON.stringify(t)) return;   // closed with × for this very selection
      dismissed = null;
      var rects = r.getClientRects(), first = rects[0] || r.getBoundingClientRect(), last = rects[rects.length - 1] || first;
      if (touch()) showPop(last, { target: t }, true, first); else showPop(first, { target: t }, false);
    }, 220);
  });
  // a tap on a highlight: reveal it (暗記), or open the window to change its colour or delete it
  function hitAt(x, y) {
    var hit = null;
    S.list.forEach(function (h) {
      var r = S.placed[h.id];
      if (!r || hidden(h.color)) return;
      var rs = r.getClientRects();
      for (var i = 0; i < rs.length; i++) if (x >= rs[i].left && x <= rs[i].right && y >= rs[i].top && y <= rs[i].bottom) { hit = { h: h, rect: rs[i] }; return; }
    });
    return hit;
  }
  document.addEventListener("click", function (e) {
    if (!S.article || !e.isTrusted || !S.article.contains(e.target)) return;
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    var hit = hitAt(e.clientX, e.clientY);
    if (!hit) { if (popFor) hidePop(); return; }
    if (masked(hit.h)) { e.preventDefault(); e.stopPropagation(); reveal(hit.h.id); return; }
    if (e.target.closest && e.target.closest("a[href],button,input,summary")) return;   // a link under a highlight still works
    e.stopPropagation();
    showPop(hit.rect, { id: hit.h.id });
  }, true);
  window.addEventListener("scroll", function (e) {
    if (popFor) hidePop();
    var sc = scrollerOf();
    if (WIN && sc && e.target === sc && Math.abs((WIN.v ? sc.scrollLeft : sc.scrollTop) - WIN.at) > WIN.margin / 2) queuePaint();
  }, true);
  window.addEventListener("resize", queuePaint);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (popFor) { hidePop(); e.preventDefault(); e.stopPropagation(); return; }
    if (S.view.bar) { e.preventDefault(); e.stopPropagation(); post({ egaViewer: "esc" }); }
  }, true);

  // ---------------------------------------------------------------- the book appearing, or being rebuilt
  var said = null, moTimer = 0;
  function look() {
    var a = document.getElementById("egatari-article");
    if (a !== S.article) {
      S.article = a;
      if (ro) { ro.disconnect(); if (a) { ro.observe(a); if (a.closest(".dx-body")) ro.observe(a.closest(".dx-body")); } }
      if (a) placeAll(); else if (L.host) L.host.remove();
    }
    else if (a && stale()) placeAll();
    var now = supported + ":" + !!a;
    if (now !== said) { said = now; post({ egaViewer: "hello", supported: supported, article: !!a }); }
  }
  function start() {
    look();
    // a change in the book (rebuilt, or its font size, spacing or background): find the places again, and paint on the next frame
    new MutationObserver(function (recs) {
      var mine = true;
      for (var i = 0; i < recs.length && mine; i++) if (recs[i].target !== L.host && !(recs[i].addedNodes.length === 1 && recs[i].addedNodes[0] === L.host)) mine = false;
      if (mine) return;
      clearTimeout(moTimer); moTimer = setTimeout(look, 150); queuePaint();
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "data-dx-bg", "hidden"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();

  // ---------------------------------------------------------------- from the page (only the page: the parent window)
  var isList = function (v) { return Array.isArray(v) && v.length <= 5000; };
  var okColors = function (v) { return Array.isArray(v) ? v.filter(function (c) { return COLORS.indexOf(c) >= 0; }) : []; };
  function setView(v) {
    if (!v || typeof v !== "object") return;
    var was = S.view.recall;
    S.view = { hidden: okColors(v.hidden), recall: v.recall === true, recallColors: okColors(v.recallColors), bar: v.bar === true };
    if (!S.view.recall || !was) S.revealed = {};
    paint();
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== parentWin || !m || typeof m.egaViewer !== "string" || m.egaViewer.indexOf("markup-") !== 0) return;
    if (m.egaViewer === "markup-load" && isList(m.list)) {
      S.list = m.list.filter(function (h) { return h && typeof h.id === "string" && ID_RE.test(h.id) && COLORS.indexOf(h.color) >= 0 && h.target && h.target.quote && typeof h.target.quote.exact === "string"; });
      if (m.words && typeof m.words === "object") S.words = m.words;
      setView(m.view);
      placeAll();
      if (popFor && popFor.id && !S.placed[popFor.id]) hidePop();
    } else if (m.egaViewer === "markup-view") setView(m.view);
    else if (m.egaViewer === "markup-jump" && typeof m.id === "string") {
      var r = S.placed[m.id];
      if (!r) return;
      var el = r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement;
      try { el.scrollIntoView({ block: "center" }); } catch (x) { el.scrollIntoView(); }
    }
  });
})();
