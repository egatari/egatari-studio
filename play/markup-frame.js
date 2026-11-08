// Egatari Viewer: markup inside the lesson's frame (stage 1: highlights in the book, and 暗記). Part of the page's trusted
// prefix, after play/lesson-shim.js (tools/build-play.mjs). It runs in the sandboxed frame with no more power than the lesson,
// and the page keeps the highlights (play/markup.mjs): this script only paints what the page sends and asks the page for changes.
//   - Painting: the CSS Custom Highlight API (Chrome 105+, Safari 17.2+). The lesson's HTML is never changed. Without the API
//     the page is told {supported: false} and offers no markup.
//   - Anchors (egatari-spec annotations.md, Highlight record): the data-section-id of the article section ("" outside any section)
//     and a text quote {exact, prefix, suffix} of the rendered text, so a highlight survives a new font size, line spacing,
//     background or page layout, and small edits of the lesson. Ruby readings (rt, rp) and KaTeX's hidden MathML are not text here.
//   - The small window next to a selection (or a tapped highlight): three colours, and 消す on a highlight. Above the selection,
//     so the system's own callout (iPad) and the selection handles stay free.
//   - 暗記: the text of the chosen colours turns transparent and only the colour band is left; a tap reveals one highlight.
// Messages (all {egaViewer: "markup-…"}; the page checks every one):
//   to the page   hello {supported, article}  add {color, target}  set {id, color}  del {id}  status {missing:[id], sections:{id: title}}  esc
//   from the page load {list, words, view}  view {view}  jump {id}
//     view = {hidden: ["y"…], recall: bool, recallColors: ["y"…], bar: bool}
(function markupFrame() {
  "use strict";
  var parentWin = window.parent;
  var COLORS = ["y", "p", "b"];
  var MAXQ = 1000, CTX = 32;
  var supported = typeof CSS !== "undefined" && !!CSS.highlights && typeof Highlight === "function";
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

  // ---------------------------------------------------------------- painting
  var hidden = function (c) { return S.view.hidden.indexOf(c) >= 0; };
  var masked = function (h) { return S.view.recall && S.view.recallColors.indexOf(h.color) >= 0 && !S.revealed[h.id]; };
  function paint() {
    if (!supported) return;
    var sets = {};
    COLORS.forEach(function (c) { sets["ega-" + c] = []; sets["ega-" + c + "-m"] = []; });
    S.list.forEach(function (h) {
      var r = S.placed[h.id];
      if (!r || hidden(h.color)) return;
      sets["ega-" + h.color + (masked(h) ? "-m" : "")].push(r);
    });
    Object.keys(sets).forEach(function (k) { var hl = new Highlight(); sets[k].forEach(function (r) { hl.add(r); }); if (k.slice(-2) === "-m") hl.priority = 1; CSS.highlights.set(k, hl); });
    drawMasks();
  }
  // 暗記: an opaque band of the highlight's colour over each hidden highlight, in this script's own layer (not in the book's HTML).
  // A transparent text colour alone is not enough: Safari keeps painting ruby bases and emphasis marks (傍点) of highlighted text.
  // The bands follow scrolling and reflow, are clipped to the book's scrolling box, and a tap on one reveals that highlight.
  var BAND = { white: { y: "#fff066", p: "#ff9eb0", b: "#79b8ff" }, sepia: { y: "#f5e04a", p: "#f797a8", b: "#70aae6" }, black: { y: "#7d6800", p: "#a5304a", b: "#1f4f94" } };
  var maskLayer = null, maskQueued = false;
  function scroller(el) {
    for (var e = el; e && e !== document.documentElement; e = e.parentElement) { var o = getComputedStyle(e); if (/(auto|scroll)/.test(o.overflowY + o.overflowX) && (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)) return e; }
    return null;
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
  // Each hidden highlight has one button (keyboard: Tab in reading order, Enter or Space reveals; the focus ring is on its first
  // line) and its bands (aria-hidden: a screen reader reads the text itself). The elements are kept between redraws so the focus
  // stays; a button whose highlight is scrolled out of the book's box stays focusable and brings it into view when focused.
  var MK = {};
  function inOrder(a, b) { try { return S.placed[a].compareBoundaryPoints(Range.START_TO_START, S.placed[b]); } catch (e) { return 0; } }
  function drawMasks() {
    var ids = S.view.recall && S.article ? S.list.filter(function (h) { return S.placed[h.id] && !hidden(h.color) && masked(h); }).map(function (h) { return h.id; }) : [];
    ids.sort(inOrder);
    if (!ids.length && !maskLayer) return;
    makePop();
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (!maskLayer) { maskLayer = document.createElement("div"); maskLayer.className = "mk"; root.insertBefore(maskLayer, pop); }
    var keep = {}, focusedGone = false, act = root.activeElement;
    ids.forEach(function (id) { keep[id] = true; });
    Object.keys(MK).forEach(function (id) { if (keep[id]) return; if (act === MK[id].btn) focusedGone = true; MK[id].btn.remove(); MK[id].bands.remove(); delete MK[id]; });
    var pane = document.getElementById("deck-text"), bg = pane && /^(sepia|black)$/.test(pane.getAttribute("data-dx-bg") || "") ? pane.getAttribute("data-dx-bg") : "white";
    var sc = scroller(S.article), clip = sc ? sc.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    var byId = {}; S.list.forEach(function (h) { byId[h.id] = h; });
    ids.forEach(function (id, n) {
      var h = byId[id], r = S.placed[id], e = MK[id];
      if (!e) {
        e = MK[id] = { btn: document.createElement("button"), bands: document.createElement("div") };
        e.btn.type = "button"; e.btn.className = "k"; e.btn.setAttribute("data-id", id);
        e.bands.className = "g"; e.bands.setAttribute("aria-hidden", "true"); e.bands.setAttribute("data-id", id);
        e.btn.addEventListener("focus", function () { var b = e.btn.getBoundingClientRect(); if (b.width <= 1) { var el = S.placed[id] && (S.placed[id].startContainer.nodeType === 1 ? S.placed[id].startContainer : S.placed[id].startContainer.parentElement); if (el) { try { el.scrollIntoView({ block: "center" }); } catch (x) { el.scrollIntoView(); } queueMasks(); } } });
      }
      e.btn.setAttribute("aria-label", (words().reveal || {})[h.color] || "");
      e.bands.textContent = "";
      var rs = r.getClientRects(), em = emphasisOf(r), up = em && !em.vertical ? em.size : 0, right = em && em.vertical ? em.size : 0, first = null;
      for (var i = 0; i < rs.length; i++) {
        var q = rs[i], l = Math.max(q.left, clip.left), t = Math.max(q.top - 2 - up, clip.top), rr = Math.min(q.right + right, clip.right), b = Math.min(q.bottom + 2, clip.bottom);
        if (rr - l < 1 || b - t < 1) continue;
        var d = document.createElement("div");
        d.className = "m";
        d.style.cssText = "left:" + l + "px;top:" + t + "px;width:" + (rr - l) + "px;height:" + (b - t) + "px;background:" + BAND[bg][h.color];
        e.bands.appendChild(d);
        // the button (and its focus ring) covers every piece on the first line (text across inline math or an element is in pieces)
        if (!first) first = [l, t, rr, b];
        else if (Math.abs(t - first[1]) < 6) first = [Math.min(first[0], l), Math.min(first[1], t), Math.max(first[2], rr), Math.max(first[3], b)];
      }
      e.btn.style.cssText = first ? "left:" + first[0] + "px;top:" + first[1] + "px;width:" + (first[2] - first[0]) + "px;height:" + (first[3] - first[1]) + "px" : "left:" + clip.left + "px;top:" + clip.top + "px;width:1px;height:1px;opacity:0";
      // reading order: move only what is out of place (moving the focused button would drop the focus)
      var at = maskLayer.children[2 * n];
      if (at !== e.btn) maskLayer.insertBefore(e.btn, at || null);
      if (e.btn.nextSibling !== e.bands) maskLayer.insertBefore(e.bands, e.btn.nextSibling);
    });
    if (focusedGone) { var next = revealNext; revealNext = null; if (next && MK[next]) MK[next].btn.focus(); else if (ids.length) MK[ids[0]].btn.focus(); }
  }
  var revealNext = null;
  function reveal(id) {
    var ids = Object.keys(MK).sort(inOrder), i = ids.indexOf(id);
    revealNext = root.activeElement === (MK[id] && MK[id].btn) ? ids[i + 1] || null : null;
    S.revealed[id] = true; paint();
  }
  // Enter and Space on a band's button: taken here, before the lesson's player (this script runs first, so its listener does too),
  // which would otherwise take Space for the next step
  window.addEventListener("keydown", function (e) {
    if ((e.key !== "Enter" && e.key !== " ") || !root) return;
    var t = e.composedPath ? e.composedPath()[0] : null;
    if (!t || !t.classList || !t.classList.contains("k") || t.getRootNode() !== root) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!e.repeat) reveal(t.getAttribute("data-id"));
  }, true);
  function queueMasks() { if (maskQueued || !maskLayer || !S.view.recall) return; maskQueued = true; requestAnimationFrame(function () { maskQueued = false; drawMasks(); }); }
  function placeAll() {
    S.placed = {};
    var missing = [];
    if (S.article) S.list.forEach(function (h) { var r = anchor(h); if (r) S.placed[h.id] = r; else missing.push(h.id); });
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
      ".mk .m{position:fixed;border-radius:2px;cursor:pointer;-webkit-tap-highlight-color:transparent}" +
      ".mk .k{all:unset;position:fixed;z-index:1;cursor:pointer;border-radius:2px;-webkit-tap-highlight-color:transparent}.mk .k:focus-visible{outline:3px solid #2c63d4;outline-offset:2px;box-shadow:0 0 0 5px #fff}" +
      ".y{background:#fff066}.p{background:#ff9eb0}.b{background:#79b8ff}.d{padding:0 10px;border:1px solid rgba(255,255,255,.6)}";
    pop = document.createElement("div"); pop.className = "w"; pop.setAttribute("role", "toolbar"); pop.hidden = true;
    root.appendChild(st); root.appendChild(pop);
    // keep the selection: a press on the window never takes the focus or clears it
    pop.addEventListener("pointerdown", function (e) { e.preventDefault(); e.stopPropagation(); });
    pop.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
    pop.addEventListener("click", function (e) { e.stopPropagation(); var b = e.target.closest ? e.target.closest("button") : null; if (b) choose(b.getAttribute("data-a")); });
    // a tap on a band, or Enter / Space on its button: reveal that highlight (the keyboard's focus goes on to the next one)
    root.addEventListener("click", function (e) {
      var m = e.target.closest ? e.target.closest(".k,.g") : null;
      if (!m || !e.isTrusted) return;
      e.preventDefault(); e.stopPropagation();
      reveal(m.getAttribute("data-id"));
    });
    pop.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hidePop(); } });
    document.documentElement.appendChild(host);
  }
  function showPop(rect, forWhat) {
    makePop();
    if (!host.isConnected) document.documentElement.appendChild(host);
    popFor = forWhat;
    var W = words(), cur = forWhat.id ? (S.list.filter(function (h) { return h.id === forWhat.id; })[0] || {}).color : "";
    pop.textContent = "";
    pop.setAttribute("aria-label", W.window);
    COLORS.forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.className = "c " + c; b.setAttribute("data-a", c); b.setAttribute("aria-label", W[c]); b.title = W[c]; if (forWhat.id) b.setAttribute("aria-pressed", c === cur ? "true" : "false"); pop.appendChild(b); });
    if (forWhat.id) { var d = document.createElement("button"); d.type = "button"; d.className = "d"; d.setAttribute("data-a", "del"); d.textContent = W.del; pop.appendChild(d); }
    pop.hidden = false;
    var pw = pop.offsetWidth, ph = pop.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = Math.max(8, Math.min(vw - pw - 8, rect.left + rect.width / 2 - pw / 2)), y = rect.top - ph - 12;
    if (y < 8) y = Math.min(vh - ph - 8, rect.bottom + 12);
    pop.style.left = Math.round(x) + "px"; pop.style.top = Math.round(y) + "px";
  }
  function hidePop() { if (pop) pop.hidden = true; popFor = null; }
  function choose(a) {
    var f = popFor;
    if (!f) return;
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
  var selTimer = 0;
  document.addEventListener("selectionchange", function () {
    clearTimeout(selTimer);
    selTimer = setTimeout(function () {
      if (!S.article || !supported) return;
      var sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { if (popFor && !popFor.id) hidePop(); return; }
      var r = sel.getRangeAt(0), t = targetOf(r);
      if (!t) { if (popFor && !popFor.id) hidePop(); return; }
      var rects = r.getClientRects(), first = rects[0] || r.getBoundingClientRect();
      showPop(first, { target: t });
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
    if (masked(hit.h)) { e.preventDefault(); e.stopPropagation(); S.revealed[hit.h.id] = true; paint(); return; }
    if (e.target.closest && e.target.closest("a[href],button,input,summary")) return;   // a link under a highlight still works
    e.stopPropagation();
    showPop(hit.rect, { id: hit.h.id });
  }, true);
  window.addEventListener("scroll", function () { if (popFor) hidePop(); queueMasks(); }, true);
  window.addEventListener("resize", queueMasks);
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (popFor) { hidePop(); e.preventDefault(); e.stopPropagation(); return; }
    if (S.view.bar) { e.preventDefault(); e.stopPropagation(); post({ egaViewer: "esc" }); }
  }, true);

  // ---------------------------------------------------------------- the book appearing, or being rebuilt
  var css = document.createElement("style");
  css.textContent =
    "::highlight(ega-y){background-color:#fff066}::highlight(ega-p){background-color:#ff9eb0}::highlight(ega-b){background-color:#79b8ff}" +
    "#deck-text[data-dx-bg=sepia] ::highlight(ega-y){background-color:#f5e04a}#deck-text[data-dx-bg=sepia] ::highlight(ega-p){background-color:#f797a8}#deck-text[data-dx-bg=sepia] ::highlight(ega-b){background-color:#70aae6}" +
    "#deck-text[data-dx-bg=black] ::highlight(ega-y){background-color:#7d6800}#deck-text[data-dx-bg=black] ::highlight(ega-p){background-color:#a5304a}#deck-text[data-dx-bg=black] ::highlight(ega-b){background-color:#1f4f94}" +
    "::highlight(ega-y-m),::highlight(ega-p-m),::highlight(ega-b-m){color:transparent;-webkit-text-fill-color:transparent;text-emphasis-color:transparent;-webkit-text-emphasis-color:transparent;text-decoration-color:transparent;text-shadow:none}::highlight(ega-y-m){background-color:#fff066}::highlight(ega-p-m){background-color:#ff9eb0}::highlight(ega-b-m){background-color:#79b8ff}" +
    "#deck-text[data-dx-bg=sepia] ::highlight(ega-y-m){background-color:#f5e04a}#deck-text[data-dx-bg=sepia] ::highlight(ega-p-m){background-color:#f797a8}#deck-text[data-dx-bg=sepia] ::highlight(ega-b-m){background-color:#70aae6}" +
    "#deck-text[data-dx-bg=black] ::highlight(ega-y-m){background-color:#7d6800}#deck-text[data-dx-bg=black] ::highlight(ega-p-m){background-color:#a5304a}#deck-text[data-dx-bg=black] ::highlight(ega-b-m){background-color:#1f4f94}" +
    "";
  var said = null, moTimer = 0;
  function look() {
    var a = document.getElementById("egatari-article");
    if (a !== S.article) { S.article = a; if (a) placeAll(); }
    else if (a && stale()) placeAll();
    var now = supported + ":" + !!a;
    if (now !== said) { said = now; post({ egaViewer: "hello", supported: supported, article: !!a }); }
  }
  function start() {
    (document.head || document.documentElement).appendChild(css);
    look();
    new MutationObserver(function () { clearTimeout(moTimer); moTimer = setTimeout(look, 150); queueMasks(); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "data-dx-bg", "hidden"] });
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
      S.list = m.list.filter(function (h) { return h && typeof h.id === "string" && COLORS.indexOf(h.color) >= 0 && h.target && h.target.quote && typeof h.target.quote.exact === "string"; });
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
