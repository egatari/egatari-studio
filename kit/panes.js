// 窓（ペイン）の並べ方と同期（panes.js）：スライド（舞台）と本の窓（Player P2、format spec §9C.5・§9C.10）
// - 並べ方は 3 つ：slides（舞台だけ）・book（本の窓だけ。仕様の flow）・split（左にスライド、右に本。仕様の split）。ページ分けと見開き（pages）は GA の後
// - 本の窓に出すもの：本文（§9C.6 の <article id="egatari-article">。組み立てが #egatari-readable に入れ、deck.js が隠す。ここで窓に移す）、
//   なければ台本で読む（スライドを小さく並べ、その後ろに各ステップの台本。deck-narration から作る。§9C.10）
// - 位置は 1 つ（DECK の (i, k)）。並べ方を替えても位置は変わらない。舞台を動かすと本の窓はその所へ（見えていれば動かさない）、
//   本の窓をスクロールすると舞台はその所へ（DECK.move。cause "seek"）。今の所には左の線の印（縦書きは上の線。色だけに頼らない。aria-current）
// - 再生中（自動再生）は本の窓が付いていく。見る人が本の窓をスクロールしたら付いていくのをやめ（再生は続け、位置も動かさない）、
//   「再生中の所に戻る」を出す。再生をもう一度始めたときも付いていくのに戻る
// - 「本で読む」（スライド → 本）・「スライドで見る」（本 → スライド。本だけの並べ方では舞台を本の上に重ねる）
// - 台本で読む（本だけ）では、スクロールで入ったステップを一度だけ動かす（今のスライドの縮図の場所に本物の舞台を置く）。動きを減らす設定なら最後の形だけ
// - 選んだ並べ方と仕切りの位置は、この端末に覚える（localStorage）。ファイルには書かない
// - 動画・発表者ビュー（とその中の画面）では何も作らない。(i, k, t) の描画（deck.js の seek）は変えない：舞台を置く箱（DECK.stageBox）だけを渡す
(function(){
"use strict";
var DECK = window.DECK;
var Q = new URLSearchParams(location.search);
if (!DECK || DECK.mode === "video" || DECK.view || Q.get("presenter")) return;
var JA = DECK.ja !== false;
function L(ja, en){ return JA ? ja : en; }
var REDUCE = false;
try { REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
var EMBED = window.parent !== window && Q.get("embed") === "1";
var html = document.documentElement;
var MIN_STAGE = 280, MIN_TEXT = 320, DIV = 9, NARROW = MIN_STAGE + MIN_TEXT + DIV;
var KEY = ((DECK.FORMAT && DECK.FORMAT.id) || "deck") + "-player-";
// 仕様の並べ方の名前（?layout=・埋め込みの layout）→ ここの名前。pages（ページ分け）は GA ではスクロールで見せる
var SPEC_IN = {slides: "slides", flow: "book", pages: "book", split: "split", book: "book"};
var SPEC_OUT = {slides: "slides", book: "flow", split: "split"};

var P = {layout: "slides", vertical: false, pane: null, body: null, head: null, div: null,
  anchors: [], secOf: [], marked: null, detached: false, playing: false, userAt: 0, progUntil: 0, fromText: false,
  ratio: null, splitStage: null, ov: null, back: [], readBack: null, live: null, menu: null, menuFrom: null, bp: null, readIn: null, pos: {i: 0, k: 0}};

function store(k, v){ try { if (v === null) localStorage.removeItem(KEY + k); else localStorage.setItem(KEY + k, v); } catch (e) {} }
function stored(k){ try { return localStorage.getItem(KEY + k); } catch (e) { return null; } }
function docKey(){ return "layout:" + ((DECK.META && typeof DECK.META.docId === "string" && DECK.META.docId) || location.pathname); }
function slides(){ return DECK.slides || []; }
function titleOf(s){ var h = s && s.querySelector("h2, h1"); return h ? (h.getAttribute("data-title") || h.textContent.replace(/\s+/g, " ").trim()) : ""; }
function el(tag, cls, text){ var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, label, icon, fn){
  var b = el("button", cls); b.type = "button";
  b.innerHTML = icon ? '<svg viewBox="0 0 16 16" aria-hidden="true">' + icon + "</svg>" : "";
  b.appendChild(el("span", "lab", label));
  b.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); fn(b, e); });
  return b;
}
function setIcon(b, icon, label, pressed){
  b.querySelector("svg").innerHTML = icon; b.querySelector(".lab").textContent = label;
  if (pressed !== undefined) b.setAttribute("aria-pressed", pressed ? "true" : "false");
}
var ICON = {
  view: '<rect x="1.8" y="3" width="12.4" height="10" rx="1.2"/><path d="M8 3v10M9.8 6h2.6M9.8 8.4h2.6M9.8 10.8h1.6"/>',
  book: '<path d="M8 4.2C6.6 3.2 4.6 2.9 2.2 3.1v9.4c2.4-.2 4.4.1 5.8 1.1 1.4-1 3.4-1.3 5.8-1.1V3.1c-2.4-.2-4.4.1-5.8 1.1zM8 4.2v9.4"/>',
  watch: '<rect x="1.6" y="3" width="12.8" height="8.4" rx="1.2"/><path d="M6.6 5.4l3.4 1.8-3.4 1.8z" fill="currentColor"/><path d="M5 13.6h6"/>',
  back: '<path d="M9.5 3.5L5 8l4.5 4.5M5.4 8H13"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  prev: '<path d="M10 3.2L5.2 8l4.8 4.8"/>', next: '<path d="M6 3.2L10.8 8 6 12.8"/>',
  play: '<path d="M5 3.2l8 4.8-8 4.8z" fill="currentColor"/>', stop: '<rect x="4" y="4" width="8" height="8" rx="1.2" fill="currentColor"/>',
  follow: '<path d="M8 2.5v9M4 8l4 4 4-4"/>'
};

// ---------------------------------------------------------------- 本の窓の中身
var ART = null, HAS_ART = false, T = null;
// 画面の言葉（docs/terms.json：book・read-with-script・slides-and-book・read-in-book・watch-on-slides・back-to-playing）
function words(){
  return {view: L("表示", "View"), slides: L("スライド", "Slides"),
    book: HAS_ART ? L("本", "Book") : L("台本で読む", "Read with script"),
    split: HAS_ART ? L("スライドと本", "Slides and book") : L("スライドと台本", "Slides and script"),
    readIn: L("本で読む", "Read in the book"), watch: L("スライドで見る", "Watch on slides"),
    backPlay: L("再生中の所に戻る", "Back to the playing part"), back: L("戻る", "Back"), close: L("閉じる", "Close"),
    prev: L("前へ", "Previous"), next: L("次へ", "Next"), play: L("自動再生", "Autoplay"), stop: L("自動再生を止める", "Stop autoplay")};
}
function stepTarget(a){
  var v = a.getAttribute("data-egatari-step") || "", r = v && DECK.resolveFragment ? DECK.resolveFragment(v) : {error: "none"};
  return r && !r.error ? {i: r.i, k: r.k} : null;
}
// 本文の節とスライドの対応（§9C.5）：スライドの節＝data-article の最初の id（本文の節であるもの）、なければそのスライドへの
// ステップのリンクを持つ最初の節。節のスライド＝節の中の最初のステップのリンクの行き先、なければ data-article で名指す最初のスライド
function articleMaps(){
  var secs = [].slice.call(ART.querySelectorAll("section[data-section-id]")), byId = Object.create(null), S = slides();
  secs.forEach(function(x){ byId[x.getAttribute("data-section-id")] = x; });
  var secOf = S.map(function(s){
    var ids = (s.getAttribute("data-article") || "").split(/\s+/);
    for (var j = 0; j < ids.length; j++) if (ids[j] && byId[ids[j]]) return byId[ids[j]];
    return null;
  });
  var anchors = [];
  secs.forEach(function(x){
    var links = [].slice.call(x.querySelectorAll("a[data-egatari-step]")).map(function(a){ return {el: a, to: stepTarget(a)}; }).filter(function(l){ return l.to; });
    var to = links.length ? links[0].to : null, id = " " + x.getAttribute("data-section-id") + " ";
    if (!to) for (var j = 0; j < S.length; j++) if ((" " + (S[j].getAttribute("data-article") || "") + " ").indexOf(id) >= 0){ to = {i: j, k: 0}; break; }
    links.forEach(function(l){ if (secOf[l.to.i] === null) secOf[l.to.i] = x; });
    // 節の初めはそのスライドのステップ 0。節の中のステップのリンクを読み過ぎたら、そのステップ（その節のスライドへのものだけ。ほかのスライドへ舞台を飛ばさない）
    anchors.push({el: x, i: to ? to.i : null, k: 0, sec: x});
    if (to) links.forEach(function(l){ if (l.to.i === to.i && l.to.k > 0) anchors.push({el: l.el, i: l.to.i, k: l.to.k, sec: x}); });
  });
  P.secOf = secOf; P.anchors = anchors;
}
function buildArticle(){
  P.body.appendChild(ART);
  P.vertical = ART.classList.contains("egatari-vertical");
  P.body.classList.toggle("dx-vertical", P.vertical);
  articleMaps();
  // 「スライドで見る」：スライドにつながる節の見出しの後ろ（本だけの並べ方で出す。横並びでは舞台が隣にある）
  P.anchors.forEach(function(a){
    var h = a.el === a.sec && a.i !== null && a.sec.querySelector("h2");
    if (!h) return;
    var b = btn("dx-watch", T.watch, ICON.watch, function(b){ openOverlay(a.i, a.k, b); });
    b.setAttribute("aria-label", T.watch + L("：", ": ") + (titleOf(slides()[a.i]) || String(a.i + 1)));
    h.parentNode.insertBefore(b, h.nextSibling);
  });
}
// 台本で読む：スライドの縮図（最後の形の写し。舞台は 1 つだけなので、写しは動かない）と、各ステップの台本
function stepKeyOf(i, k){ var key = DECK.stepKey(i, k); return key.slice(key.lastIndexOf(":") + 1); }
function buildScript(){
  var S = slides(), root = el("div", "dx-script"), anchors = [], roles = Object.create(null), nr = 0;
  root.lang = html.lang || "";
  for (var sk in DECK.NARRATION) for (var st in DECK.NARRATION[sk]) (DECK.NARRATION[sk][st] || []).forEach(function(t){ if (t && t.role && !roles[t.role]){ roles[t.role] = 1; nr++; } });
  (DECK.aside || function(f){ return f(); })(function(){
    S.forEach(function(s, i){
      var sec = el("section", "dx-slide"); sec.setAttribute("data-i", i);
      var h = el("h2", "dx-stitle"); h.appendChild(el("span", "dx-no", String(i + 1))); h.appendChild(document.createTextNode(" " + (titleOf(s) || L("スライド ", "Slide ") + (i + 1))));
      sec.appendChild(h);
      var th = el("button", "dx-thumb"); th.type = "button"; th.setAttribute("data-i", i);
      th.setAttribute("aria-label", T.watch + L("：", ": ") + (titleOf(s) || String(i + 1)));
      DECK.seek(i, s._max, Infinity);
      var c = s.cloneNode(true);
      c.classList.remove("active"); c.removeAttribute("id");
      [].forEach.call(c.querySelectorAll("[id]"), function(x){ x.removeAttribute("id"); });
      c.style.visibility = "visible"; c.style.opacity = 1; c.style.zIndex = "auto";
      c.setAttribute("aria-hidden", "true"); c.inert = true;
      // 写しは影の木に入れる（文書の querySelector に写しの部品・ボタン・id が見つからないように）。体裁は文書のものを 1 枚にまとめて使う
      var box = el("span", "dx-tbox"); box.setAttribute("aria-hidden", "true");
      var sh = box.attachShadow ? box.attachShadow({mode: "closed"}) : box;
      if (sh !== box){ var sheet = thumbSheet(); if (sheet) sh.adoptedStyleSheets = [sheet]; else [].forEach.call(document.querySelectorAll("style"), function(x){ sh.appendChild(x.cloneNode(true)); }); sh.appendChild(el("style", "", ".slide{position:absolute!important;left:0;top:0;transform-origin:0 0;transform:scale(var(--dx-s,.3));pointer-events:none}")); }
      sh.appendChild(c); th.appendChild(box);
      th.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); if (P.layout === "split") DECK.move(i, 0, true, "link"); else openOverlay(i, 0, th); });
      sec.appendChild(th);
      anchors.push({el: sec, i: i, k: 0});
      var narr = DECK.NARRATION[s._key] || {};
      for (var k = 0; k <= s._max; k++){
        var turns = narr[stepKeyOf(i, k)] || [];
        if (!turns.length) continue;
        var b = el("div", "dx-step"); b.setAttribute("data-step-key", s._key + ":" + stepKeyOf(i, k));
        turns.forEach(function(t){
          var p = el("p");
          if (nr > 1 && t.role){ p.appendChild(el("b", "dx-role", t.role)); p.appendChild(document.createTextNode(" ")); }
          p.appendChild(document.createTextNode(t.text || ""));
          b.appendChild(p);
        });
        sec.appendChild(b);
        anchors.push({el: b, i: i, k: k});
      }
      root.appendChild(sec);
    });
  });
  P.body.appendChild(root);
  P.anchors = anchors;
  if (typeof ResizeObserver === "function") new ResizeObserver(thumbScale).observe(root); else window.addEventListener("resize", thumbScale);
  thumbScale();
}
// 縮図の影の木の体裁：文書の規則（字の @font-face は文書にあるので除く）。:root・html の規則は影の木の :host に当てる
var THUMB_SHEET;
function thumbSheet(){
  if (THUMB_SHEET !== undefined) return THUMB_SHEET;
  THUMB_SHEET = null;
  try {
    var out = [];
    [].forEach.call(document.styleSheets, function(ss){ var rs; try { rs = ss.cssRules; } catch (e) { return; } [].forEach.call(rs, function(r){ if (r.type !== 5) out.push(r.cssText.replace(/(^|[\s,(>+~])(?::root|html)(?![\w-])/g, "$1:host")); }); });
    var sh = new CSSStyleSheet(); sh.replaceSync(out.join("\n")); THUMB_SHEET = sh;
  } catch (e) {}
  return THUMB_SHEET;
}
function thumbScale(){
  var t = P.body && P.body.querySelector(".dx-tbox");
  if (t && t.clientWidth) P.body.style.setProperty("--dx-s", String(t.clientWidth / 1280));
  if (P.live) DECK.fit();
}

// ---------------------------------------------------------------- 窓の DOM
function ensurePane(){
  if (P.pane) return;
  var pane = P.pane = el("div"); pane.id = "deck-text";
  pane.setAttribute("role", "region"); pane.setAttribute("aria-label", T.book);
  var head = P.head = el("div", "dx-head");
  var back = btn("dx-back", T.back, ICON.back, function(){ paneBack(); }); back.hidden = true;
  var play = btn("dx-play", T.play, ICON.play, function(){ DECK.autoplay(); });
  play.setAttribute("aria-pressed", "false"); play.setAttribute("aria-keyshortcuts", "a");
  var view = btn("dx-view", T.view, ICON.view, function(b){ menu(b); });
  view.setAttribute("aria-haspopup", "menu"); view.setAttribute("aria-expanded", "false"); view.setAttribute("aria-keyshortcuts", "r");
  head.appendChild(back); head.appendChild(el("span", "dx-gap")); head.appendChild(play); head.appendChild(view);
  pane.appendChild(head);
  var body = P.body = el("div", "dx-body"); body.tabIndex = 0;
  body.setAttribute("aria-label", T.book);
  pane.appendChild(body);
  document.body.appendChild(pane);
  if (HAS_ART) buildArticle(); else buildScript();
  // 見る人の動かし方（ホイール・指・つまみ・キー）：その後のスクロールは見る人のもの（付いていくのをやめる・位置を動かす）
  // 再生器が動かしている途中（滑らかなスクロール）なら、そこで止める（見る人の動かし方を上書きしない）
  var mine = function(){
    P.userAt = Date.now();
    if (P.userAt < P.progUntil){ P.progUntil = 0; body.scrollTo({left: body.scrollLeft, top: body.scrollTop, behavior: "auto"}); }
  };
  ["pointerdown", "touchstart", "keydown"].forEach(function(n){ body.addEventListener(n, mine, {passive: true}); });
  body.addEventListener("wheel", function(e){
    mine();
    // 縦書き：縦のホイールで横に送る（先へ進む向きは左）
    if (P.vertical && Math.abs(e.deltaY) > Math.abs(e.deltaX)){
      e.preventDefault();
      body.scrollLeft -= e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? body.clientWidth : 1);
    }
  }, {passive: false});
  body.addEventListener("scroll", onScroll, {passive: true});
  if ("onscrollend" in window) body.addEventListener("scrollend", function(){ if (Date.now() < P.progUntil) P.progUntil = Date.now() + 30; });
  body.addEventListener("click", paneClick);
  // 一度でも外へ出きったら、もう一度入ったときに動かす（Player P2）
  if (typeof IntersectionObserver === "function"){
    var io = new IntersectionObserver(function(es){ es.forEach(function(x){ if (!x.isIntersecting) x.target._dxPlayed = false; }); }, {root: body});
    P.anchors.forEach(function(a){ io.observe(a.el); });
  }
  // 仕切り（横並びの境目）：ドラッグ・←→（Shift で大きく）・ダブルクリックか Enter で初めの位置。この端末に覚える
  var d = P.div = el("div"); d.id = "deck-split"; d.tabIndex = 0; d.hidden = true;
  d.setAttribute("role", "separator"); d.setAttribute("aria-orientation", "vertical"); d.setAttribute("aria-label", T.split);
  d.setAttribute("aria-valuemin", "0"); d.setAttribute("aria-valuemax", "100"); d.setAttribute("aria-controls", "deck-text");
  d.addEventListener("pointerdown", function(e){
    if (e.button) return;
    e.preventDefault(); e.stopPropagation(); d.setPointerCapture(e.pointerId); d.classList.add("drag");
    var mv = function(ev){ setRatio(ev.clientX / innerWidth); };
    var up = function(){ d.classList.remove("drag"); d.removeEventListener("pointermove", mv); d.removeEventListener("pointerup", up); d.removeEventListener("pointercancel", up); store("split", String(P.ratio)); };
    d.addEventListener("pointermove", mv); d.addEventListener("pointerup", up); d.addEventListener("pointercancel", up);
  });
  d.addEventListener("dblclick", function(e){ e.preventDefault(); P.ratio = null; store("split", null); place(true); });
  d.addEventListener("keydown", function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var step = e.shiftKey ? .1 : .02, r = P.splitStage.w / innerWidth;
    if (e.key === "ArrowLeft") r -= step; else if (e.key === "ArrowRight") r += step;
    else if (e.key === "Home") r = 0; else if (e.key === "End") r = 1;
    else if (e.key === "Enter"){ e.preventDefault(); e.stopPropagation(); P.ratio = null; store("split", null); place(true); return; }
    else return;
    e.preventDefault(); e.stopPropagation();
    setRatio(r); store("split", String(P.ratio));
  });
  document.body.appendChild(d);
  // 再生中の所に戻る（窓の外に置く：台本の縮図に置いた舞台より上に出す）
  var bp = P.bp = btn("", T.backPlay, ICON.follow, function(){ resumeFollow(true); });
  bp.id = "deck-backplay"; bp.hidden = true;
  document.body.appendChild(bp);
}
// 仕切りの位置：舞台の幅の割合。初めは高さいっぱい（16:9）で幅の 6 割まで。狭めすぎない（舞台 280px・本 320px）
function defaultRatio(){ return Math.min(.6, (innerHeight * 16 / 9) / innerWidth); }
function setRatio(r){ P.ratio = Math.max(0, Math.min(1, r)); place(true); }
function splitFits(){ return innerWidth >= NARROW; }
function place(refit){
  var vw = innerWidth, vh = innerHeight;
  if (P.layout === "split"){
    var r = P.ratio === null ? defaultRatio() : P.ratio, w = Math.round(Math.max(MIN_STAGE, Math.min(vw - MIN_TEXT - DIV, r * vw)));
    P.splitStage = {x: 0, y: 0, w: w, h: vh};
    P.pane.style.left = (w + DIV) + "px"; P.pane.style.width = (vw - w - DIV) + "px";
    P.div.style.left = w + "px";
    P.div.setAttribute("aria-valuenow", String(Math.round(w / vw * 100)));
    P.div.setAttribute("aria-valuetext", Math.round(w / vw * 100) + "%");
  } else if (P.pane){ P.pane.style.left = "0px"; P.pane.style.width = vw + "px"; }
  placeReadIn(); placeBackPlay();
  // 窓の大きさの変わり目と同じに扱う（deck.js の fit と部品の測り直し、kit/tools.js の帯とペンの面）
  if (refit) window.dispatchEvent(new Event("resize"));
}

// ---------------------------------------------------------------- 舞台を置く箱（kit/deck.js の fit・kit/tools.js の帯が読む）
DECK.stageBox = function(){
  if (P.ov) return P.ov.box();
  if (P.layout === "split" && P.splitStage) return P.splitStage;
  if (P.layout === "book" && P.live) return liveBox();
  return null;
};
// 台本で読む（本だけ）：今のスライドの縮図の場所。窓の本文の欄からはみ出す分は切る
function liveBox(){
  var r = P.live.getBoundingClientRect(), b = P.body.getBoundingClientRect();
  return {x: r.left, y: r.top, w: r.width, h: r.height, clip: {top: Math.max(0, b.top - r.top), bottom: Math.max(0, r.bottom - b.bottom)}};
}
function setLive(){
  var th = P.layout === "book" && !HAS_ART && !P.ov && P.body ? P.body.querySelector('.dx-thumb[data-i="' + P.pos.i + '"]') : null;
  if (th === P.live) return;
  if (P.live) P.live.classList.remove("dx-live");
  P.live = th;
  if (th) th.classList.add("dx-live");
  html.classList.toggle("deck-live", !!th);
}

// ---------------------------------------------------------------- 並べ方
function setLayout(name, o){
  o = o || {};
  if (!SPEC_OUT[name]) return;
  if (name === "split" && !splitFits()) name = "book";
  var before = P.layout, hadFocus = !!(P.pane && P.pane.contains(document.activeElement));
  if (name !== "slides") ensurePane();
  P.layout = name;
  html.setAttribute("data-deck-layout", name);
  if (o.persist) store(docKey(), name);
  if (P.pane){
    P.pane.hidden = name === "slides";
    P.div.hidden = name !== "split";
    P.head.querySelector(".dx-play").hidden = name !== "book";
  }
  var st = document.getElementById("stage");
  // 本だけの並べ方：舞台は読み上げソフトにも Tab にも出さない（スライドは「スライドで見る」の重ねで見る）
  if (st){ var off = name === "book" && !P.ov; st.inert = off; if (off) st.setAttribute("aria-hidden", "true"); else st.removeAttribute("aria-hidden"); }
  setLive();
  place(true);
  if (name !== "slides" && before === "slides" && !(P.pos.i === 0 && P.pos.k === 0)) syncText(P.pos.i, P.pos.k, false);
  mark(P.pos.i, P.pos.k);
  if (o.focus !== false){
    if (name === "book" && P.body && !P.pane.contains(document.activeElement)) P.body.focus({preventScroll: true});
    else if (name === "slides" && hadFocus && st){ if (!st.hasAttribute("tabindex")) st.tabIndex = -1; st.focus({preventScroll: true}); }
  }
  if (P.readBack && name === P.readBack.layout) P.readBack = null;
  syncBackBtn();
  if (EMBED && o.reply) try { window.parent.postMessage({egatari: "layout", id: o.reply.id, layout: SPEC_OUT[name]}, "*"); } catch (e) {}
  if (before !== name) say(name === "slides" ? T.slides : name === "book" ? T.book : T.split);
}
function cycle(){
  var order = splitFits() ? ["slides", "split", "book"] : ["slides", "book"];
  setLayout(order[(order.indexOf(P.layout) + 1) % order.length], {persist: true});
}
// 開いたときの並べ方（Player P1・P2）：?layout=（埋め込みの指定も） ＞ この端末で前に選んだもの ＞ offer.open ＞ metadata.primary ＞ モードの既定
function metaPrimary(){
  var m = DECK.META || {};
  if (m.primary) return m.primary;
  if (m.metadata && m.metadata.primary) return m.metadata.primary;
  var ix = DECK.FORMAT && DECK.FORMAT.indexId && document.getElementById(DECK.FORMAT.indexId);
  if (ix) try { var j = JSON.parse(ix.textContent); return j && j.metadata && j.metadata.primary; } catch (e) {}
  return null;
}
function initialLayout(){
  var q = SPEC_IN[Q.get("layout") || ""];
  if (q) return q;
  var r = SPEC_IN[stored(docKey()) || ""];
  if (r) return r;
  var open = (DECK.META && DECK.META.offer && DECK.META.offer.open) || {};
  var face = open.face || metaPrimary(), mode = open.mode || Q.get("mode") || DECK.mode;
  if (face === "read") return "book";
  if (mode === "learn") return splitFits() ? "split" : "book";
  return "slides";
}

// ---------------------------------------------------------------- 同期
function rectOf(e){ return e.getBoundingClientRect(); }
// 窓の中の、読み進める向きの位置（横書き：上から、縦書き：右から）
function along(e, b){ var r = rectOf(e); return P.vertical ? b.right - r.right : r.top - b.top; }
function visible(e){
  var b = rectOf(P.body), r = rectOf(e);
  var o = P.vertical ? Math.min(r.right, b.right) - Math.max(r.left, b.left) : Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
  return o >= Math.min(40, P.vertical ? r.width : r.height) - .5;
}
function targetOf(i, k){
  if (HAS_ART) return P.secOf[i] || null;
  var best = null;
  P.anchors.forEach(function(a){ if (a.i === i && a.k <= k && (!best || a.k >= best.k)) best = a; });
  return best ? best.el : null;
}
function scrollToEl(e, smooth){
  var d = along(e, rectOf(P.body)) - 12, o = {behavior: smooth && !REDUCE ? "smooth" : "auto"};
  P.progUntil = Date.now() + (o.behavior === "smooth" ? 900 : 150);
  if (P.vertical) o.left = P.body.scrollLeft - d; else o.top = P.body.scrollTop + d;
  P.body.scrollTo(o);
}
// 舞台の位置 → 本の窓：今の所が見えていなければその所へ（読んでいる途中で動かさない）
function syncText(i, k, smooth){
  if (!P.pane || P.layout === "slides") return;
  var t = targetOf(i, k);
  if (t && !visible(t)) scrollToEl(t, smooth);
}
function mark(i, k){
  if (!P.pane) return;
  var t = targetOf(i, k);
  if (t === P.marked) return;
  if (P.marked){ P.marked.classList.remove("dx-cur"); P.marked.removeAttribute("aria-current"); }
  P.marked = t;
  if (t){ t.classList.add("dx-cur"); t.setAttribute("aria-current", HAS_ART ? "location" : "step"); }
}
// 読み進めた所：窓の初めから 4 分の 1 の線を越えた最後の目印
function readAnchor(){
  var b = rectOf(P.body), line = (P.vertical ? b.width : b.height) * .25, cur = null;
  for (var j = 0; j < P.anchors.length; j++){ if (along(P.anchors[j].el, b) <= line) cur = P.anchors[j]; else if (!HAS_ART) break; }
  return cur || P.anchors[0] || null;
}
var scrollRaf = 0;
function onScroll(){
  if (P.live) DECK.fit();
  if (!scrollRaf) scrollRaf = requestAnimationFrame(function(){ scrollRaf = 0; scrolled(); });
}
function scrolled(){
  if (P.ov || P.layout === "slides") return;
  var now = Date.now();
  if (!(now - P.userAt < 1200 || now >= P.progUntil)) return;   // 付いていくための（再生器の）スクロール
  if (P.playing){
    // 再生中に見る人がスクロールした：付いていくのをやめる（再生は続け、位置も動かさない）
    if (!P.detached){ P.detached = true; P.bp.hidden = false; placeBackPlay(); }
    return;
  }
  var a = readAnchor();
  if (!a || a.i === null || (a.i === P.pos.i && a.k === P.pos.k)) return;
  // スクロールで入ったステップは一度だけ動かす（外へ出きるまで再び動かさない）。動きを減らす設定なら最後の形
  var animate = !REDUCE && !a.el._dxPlayed;
  a.el._dxPlayed = true;
  P.fromText = true;
  try { DECK.move(a.i, a.k, animate, "seek"); } finally { P.fromText = false; }
}
function resumeFollow(scroll){
  P.detached = false;
  if (P.bp) P.bp.hidden = true;
  if (scroll){ var t = targetOf(P.pos.i, P.pos.k); if (t) scrollToEl(t, true); if (P.body) P.body.focus({preventScroll: true}); }
}
function placeBackPlay(){
  if (!P.bp || P.bp.hidden || !P.pane) return;
  var r = rectOf(P.pane);
  P.bp.style.left = (r.left + r.width / 2) + "px";
}
document.addEventListener("deck:pos", function(e){
  var d = e.detail || {}, was = P.playing;
  P.pos = {i: d.i, k: d.k};
  P.playing = !!d.auto;
  // 再生を始めた（もう一度）：付いていくのに戻る。再生をやめた：見る人の読んでいる所のまま
  if (P.detached && P.playing !== was) resumeFollow(false);
  if (P.pane) setIcon(P.head.querySelector(".dx-play"), P.playing ? ICON.stop : ICON.play, P.playing ? T.stop : T.play, P.playing);
  placeReadIn();
  if (P.ov){ P.ov.sync(); return; }
  if (P.layout === "slides" || !P.pane) return;
  setLive();
  mark(d.i, d.k);
  if (P.live) DECK.fit();
  if (P.fromText || P.detached) return;
  syncText(d.i, d.k, true);
});

// ---------------------------------------------------------------- 本の窓の中のリンクと「戻る」
function paneClick(e){
  var a = e.target.closest && e.target.closest("a[href]");
  if (!a || !P.body.contains(a) || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  var to = a.hasAttribute("data-egatari-step") ? stepTarget(a) : null;
  if (to){
    e.preventDefault(); e.stopPropagation();
    // 横並びでは舞台をその所へ（スライドへのリンクと同じ。戻るは舞台の「戻る」）。本だけでは重ねて見せる（§9C.5）
    if (P.layout === "split") DECK.follow(a.getAttribute("data-egatari-step"));
    else openOverlay(to.i, to.k, a);
    return;
  }
  var h = a.getAttribute("href") || "";
  if (h.charAt(0) !== "#") return;
  var id = h.slice(1); try { id = decodeURIComponent(id); } catch (err) {}
  var t = document.getElementById(id);
  if (!t || !P.body.contains(t)) return;
  // 本文の中の参照（図・式・節・文献・脚注）：その所へ。「戻る」でリンクの所へ
  e.preventDefault(); e.stopPropagation();
  P.back.push({left: P.body.scrollLeft, top: P.body.scrollTop, el: a});
  P.userAt = Date.now();
  scrollToEl(t, false);
  syncBackBtn();
}
function paneBack(){
  if (P.back.length){
    var b = P.back.pop();
    P.userAt = Date.now();
    P.body.scrollTo({left: b.left, top: b.top});
    if (b.el && b.el.isConnected) try { b.el.focus({preventScroll: true}); } catch (e) {}
  } else if (P.readBack){
    var rb = P.readBack; P.readBack = null;
    setLayout(rb.layout, {});
    if (rb.el && rb.el.isConnected) try { rb.el.focus({preventScroll: true}); } catch (e) {}
  }
  syncBackBtn();
}
function syncBackBtn(){ if (P.head) P.head.querySelector(".dx-back").hidden = !(P.back.length || P.readBack); }

// ---------------------------------------------------------------- 本で読む（スライド → 本。§9C.5）
function placeReadIn(){
  var show = HAS_ART && P.layout === "slides" && !P.ov && !!P.secOf[P.pos.i];
  if (!show){ if (P.readIn) P.readIn.hidden = true; return; }
  if (!P.readIn){
    P.readIn = btn("", T.readIn, ICON.book, function(b, e){ readInBook(e && e.detail === 0 ? b : null); });
    P.readIn.id = "deck-readin";
    ["pointerdown", "mousedown"].forEach(function(n){ P.readIn.addEventListener(n, function(ev){ ev.stopPropagation(); }); });
    document.body.appendChild(P.readIn);
  }
  // 舞台の右上の角の内側
  var b = DECK.stageBox() || {x: 0, y: 0, w: innerWidth, h: innerHeight}, k = Math.min(b.w / 1280, b.h / 720);
  P.readIn.style.right = Math.max(6, innerWidth - (b.x + b.w / 2 + 640 * k) + 8) + "px";
  P.readIn.style.top = Math.max(6, b.y + b.h / 2 - 360 * k + 8) + "px";
  P.readIn.hidden = false;
}
// 広い画面ではスライドと本、狭ければ本だけにして、そのスライドの節を開く。本の窓の「戻る」で元の並べ方へ
function readInBook(from){
  var sec = P.secOf[P.pos.i];
  if (!sec) return;
  var rb = {layout: P.layout, el: from};
  setLayout(splitFits() ? "split" : "book", {focus: false});
  P.readBack = rb;
  scrollToEl(sec, false);
  mark(P.pos.i, P.pos.k);
  syncBackBtn();
  var h = sec.querySelector("h2");
  if (h){ h.tabIndex = -1; h.focus({preventScroll: true}); }
}

// ---------------------------------------------------------------- スライドで見る（本 → スライド。本の上に舞台を重ねる。§9C.5）
// 舞台を画面の 8 割（スマートフォンは画面いっぱい）に置き、そのステップを動かす。音は自動再生を押したときだけ。
// ←→ でステップを前後、Esc・外を押す・閉じるで閉じ、読んでいた所とフォーカスを戻す
function openOverlay(i, k, from){
  if (P.ov) closeOverlay();
  var ov = el("div"); ov.id = "deck-ov";
  var dlg = el("div", "dx-ovbox"); dlg.setAttribute("role", "dialog"); dlg.tabIndex = -1;
  var top = el("div", "dx-ovtop"), ttl = el("span", "dx-ovtitle"); ttl.id = "deck-ov-title";
  dlg.setAttribute("aria-labelledby", ttl.id);
  var close = btn("dx-close", T.close, ICON.close, function(){ closeOverlay(); });
  close.setAttribute("aria-keyshortcuts", "Escape");
  top.appendChild(ttl); top.appendChild(close);
  var bot = el("div", "dx-ovbot");
  var pv = btn("dx-prev", T.prev, ICON.prev, function(){ DECK.autoplay(false); DECK.prev(); });
  var pl = btn("dx-ovplay", T.play, ICON.play, function(){ DECK.autoplay(); });
  var nx = btn("dx-next", T.next, ICON.next, function(){ DECK.autoplay(false); DECK.next(); });
  pv.setAttribute("aria-keyshortcuts", "ArrowLeft"); nx.setAttribute("aria-keyshortcuts", "ArrowRight"); pl.setAttribute("aria-keyshortcuts", "a");
  bot.appendChild(pv); bot.appendChild(pl); bot.appendChild(nx);
  dlg.appendChild(top); dlg.appendChild(bot);
  ov.appendChild(dlg);
  ov.addEventListener("click", function(e){ if (e.target === ov) closeOverlay(); });   // 外（暗い所）を押すと閉じる
  ["pointerdown", "mousedown"].forEach(function(n){ ov.addEventListener(n, function(e){ e.stopPropagation(); }); });
  document.body.appendChild(ov);
  var st = document.getElementById("stage");
  P.ov = {el: ov, dlg: dlg, from: from || document.activeElement, left: P.body ? P.body.scrollLeft : 0, top: P.body ? P.body.scrollTop : 0,
    box: function(){
      var vw = innerWidth, vh = innerHeight, small = vw < 640 || vh < 480, bar = 48;
      var aw = small ? vw : vw * .8, ah = small ? vh - 2 * bar : Math.min(vh * .8, vh - 2 * bar);
      var w = Math.min(aw, ah * 16 / 9), h = w * 9 / 16;
      return {x: (vw - w) / 2, y: (vh - h) / 2, w: w, h: h};
    },
    sync: function(){
      ttl.textContent = T.watch + L("：", ": ") + (titleOf(slides()[P.pos.i]) || String(P.pos.i + 1));
      setIcon(pl, P.playing ? ICON.stop : ICON.play, P.playing ? T.stop : T.play, P.playing);
      var b = P.ov.box();
      top.style.top = Math.max(0, b.y - 46) + "px"; bot.style.top = Math.min(innerHeight - 44, b.y + b.h + 4) + "px";
      top.style.left = bot.style.left = b.x + "px"; top.style.width = bot.style.width = b.w + "px";
    }};
  html.classList.add("deck-ov-open");
  if (st){ st.inert = false; st.removeAttribute("aria-hidden"); }
  [P.pane, P.div, document.getElementById("dt-cb"), document.getElementById("dt-handle")].forEach(function(x){ if (x) x.inert = true; });
  setLive();
  DECK.autoplay(false);
  DECK.move(i, k, !REDUCE, "link");
  P.ov.sync();
  window.dispatchEvent(new Event("resize"));
  dlg.focus({preventScroll: true});
}
function closeOverlay(){
  var o = P.ov;
  if (!o) return;
  DECK.autoplay(false);
  P.ov = null;
  o.el.remove();
  html.classList.remove("deck-ov-open");
  var st = document.getElementById("stage");
  if (st && P.layout === "book"){ st.inert = true; st.setAttribute("aria-hidden", "true"); }
  [P.pane, P.div, document.getElementById("dt-cb"), document.getElementById("dt-handle")].forEach(function(x){ if (x) x.inert = false; });
  setLive();
  window.dispatchEvent(new Event("resize"));
  // 読んでいた所へ戻す（位置は重ねの中で動いたままでも、本の窓は動かさない）
  if (P.body){ P.progUntil = Date.now() + 150; P.body.scrollTo({left: o.left, top: o.top}); }
  mark(P.pos.i, P.pos.k);
  if (o.from && o.from.isConnected && o.from !== document.body) try { o.from.focus({preventScroll: true}); } catch (e) {}
  else if (P.body && P.layout !== "slides") P.body.focus({preventScroll: true});
}

// ---------------------------------------------------------------- 並べ方の選択（「表示」のボタン。キー r で順に替える）
function menu(anchor){
  if (P.menu){ closeMenu(); return; }
  var m = P.menu = el("div"); m.id = "deck-layouts"; m.setAttribute("role", "menu"); m.setAttribute("aria-label", T.view);
  [["slides", T.slides], ["split", T.split], ["book", T.book]].forEach(function(x){
    if (x[0] === "split" && !splitFits()) return;
    var it = el("button", "dx-mi"); it.type = "button"; it.setAttribute("role", "menuitemradio");
    var on = P.layout === x[0];
    it.setAttribute("aria-checked", on ? "true" : "false");
    it.appendChild(el("span", "dx-check", on ? "✓" : "")).setAttribute("aria-hidden", "true");
    it.appendChild(el("span", "", x[1]));
    it.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); closeMenu(); setLayout(x[0], {persist: true}); });
    m.appendChild(it);
  });
  m.addEventListener("keydown", function(e){
    var its = [].slice.call(m.querySelectorAll(".dx-mi")), j = its.indexOf(document.activeElement);
    if (e.key === "ArrowDown") its[(j + 1) % its.length].focus();
    else if (e.key === "ArrowUp") its[(j - 1 + its.length) % its.length].focus();
    else if (e.key === "Home") its[0].focus(); else if (e.key === "End") its[its.length - 1].focus();
    else if (e.key === "Escape" || e.key === "Tab") closeMenu();
    else return;
    e.preventDefault(); e.stopPropagation();
  });
  ["pointerdown", "mousedown"].forEach(function(n){ m.addEventListener(n, function(e){ e.stopPropagation(); }); });
  document.body.appendChild(m);
  var r = anchor ? anchor.getBoundingClientRect() : {left: innerWidth / 2 - 100, top: innerHeight / 2, bottom: innerHeight / 2};
  var mh = m.offsetHeight, mw = m.offsetWidth;
  m.style.left = Math.max(6, Math.min(innerWidth - mw - 6, r.left)) + "px";
  m.style.top = (r.bottom + mh + 6 < innerHeight ? r.bottom + 4 : Math.max(6, r.top - mh - 4)) + "px";
  P.menuFrom = anchor || null;
  if (anchor) anchor.setAttribute("aria-expanded", "true");
  (m.querySelector('[aria-checked="true"]') || m.querySelector(".dx-mi")).focus();
  setTimeout(function(){ document.addEventListener("pointerdown", outside, true); }, 0);
}
function outside(e){ if (P.menu && !P.menu.contains(e.target)) closeMenu(true); }
function closeMenu(noFocus){
  if (!P.menu) return;
  document.removeEventListener("pointerdown", outside, true);
  var f = P.menuFrom; P.menu.remove(); P.menu = null; P.menuFrom = null;
  if (!f) return;
  f.setAttribute("aria-expanded", "false");
  if (!noFocus && f.isConnected) try { f.focus({preventScroll: true}); } catch (e) {}
}

// ---------------------------------------------------------------- キー
var NAV = /^(ArrowRight|ArrowLeft|ArrowUp|ArrowDown|PageUp|PageDown| |Home|End)$/;
function typing(e){ var t = e.composedPath ? e.composedPath()[0] : e.target; return !!(t && t.nodeType === 1 && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))); }
// 本の窓を送る。縦書きは左が先（← と ↓・PageDown・Space が先へ、→ と ↑・PageUp が前へ）
function scrollKey(k, shift){
  var b = P.body, page = (P.vertical ? b.clientWidth : b.clientHeight) * .85, line = 48, d = 0, beh = REDUCE ? "auto" : "smooth";
  P.userAt = Date.now();
  if (k === "Home" || k === "End"){ if (P.vertical) b.scrollTo({left: k === "Home" ? 0 : -b.scrollWidth}); else b.scrollTo({top: k === "Home" ? 0 : b.scrollHeight}); return; }
  if (k === "PageDown" || (k === " " && !shift)) d = page; else if (k === "PageUp" || k === " ") d = -page;
  else if (k === "ArrowDown") d = line; else if (k === "ArrowUp") d = -line;
  else if (P.vertical) d = k === "ArrowLeft" ? line : -line;
  else return;
  if (P.vertical) b.scrollBy({left: -d, behavior: beh}); else b.scrollBy({top: d, behavior: beh});
}
window.addEventListener("keydown", function(e){
  if (!DECK.ready || !T || e.defaultPrevented || typing(e)) return;
  if (document.getElementById("deck-extlink") || document.getElementById("dt-ov") || document.getElementById("deck-black") || P.menu) return;
  var k = e.key, mod = e.metaKey || e.ctrlKey || e.altKey;
  var stop = function(){ e.preventDefault(); e.stopPropagation(); };
  if (P.ov){
    if (mod) return;
    var onBtn = e.target && e.target.closest && e.target.closest("button");
    if (k === "Escape"){ stop(); closeOverlay(); }
    else if (k === "ArrowRight" || k === "PageDown" || (k === " " && !onBtn)){ stop(); DECK.autoplay(false); DECK.next(); }
    else if (k === "ArrowLeft" || k === "PageUp"){ stop(); DECK.autoplay(false); DECK.prev(); }
    else if (k === "Tab"){
      // 重ねの中のボタンの間で回す
      var bs = [].slice.call(P.ov.dlg.querySelectorAll("button")), j = bs.indexOf(document.activeElement);
      stop();
      (e.shiftKey ? bs[j <= 0 ? bs.length - 1 : j - 1] : bs[j < 0 || j >= bs.length - 1 ? 0 : j + 1]).focus();
    }
    else if (k === "a"){ stop(); DECK.autoplay(); }
    else if (!((k === "Enter" || k === " ") && onBtn)) e.stopPropagation();   // ほかの道具のキーは重ねの間は効かせない
    return;
  }
  if (mod) return;
  // r：スライド → スライドと本 → 本（編集のプレビューでは r は編集の画面のもの）
  if (k === "r" && !e.shiftKey && !window.DECK_DEV){ stop(); cycle(); return; }
  if (P.layout === "slides" || !P.pane) return;
  var inPane = P.pane.contains(e.target) || P.pane.contains(document.activeElement);
  if (P.layout === "book" || inPane){
    if (e.target && e.target.closest && e.target.closest("button, a[href]") && (k === "Enter" || k === " ")) return;
    if (NAV.test(k)){ stop(); scrollKey(k, e.shiftKey); return; }
    if (k === "Backspace" && (P.back.length || P.readBack)){ stop(); paneBack(); return; }
    // 舞台のない並べ方では、舞台の上に描く道具（レーザー・ペン・マーカー）は使わない
    if (P.layout === "book" && /^[xdvm]$/.test(k)) e.stopPropagation();
  }
}, true);
window.addEventListener("resize", function(){
  if (!T) return;
  if (P.layout === "split" && !splitFits()) setLayout("book", {focus: false});
  else { place(false); if (P.live) DECK.fit(); }
  if (P.ov) P.ov.sync();
  if (P.menu) closeMenu(true);
});
// 埋め込み（Player P8）：{egatari: "layout", id?, layout}。並べ替えたら同じ形で答える
window.addEventListener("message", function(e){
  var m = e.data || {};
  if (!EMBED || e.source !== window.parent || m.egatari !== "layout" || !DECK.ready || !T) return;
  var n = SPEC_IN[m.layout];
  if (n) setLayout(n, {reply: m, focus: false});
  else try { window.parent.postMessage({egatari: "error", id: m.id, code: "layout", message: "unknown layout"}, "*"); } catch (err) {}
});
// 並べ方が替わったことを読み上げソフトに知らせる（画面には出さない）
var sr = null;
function say(t){
  if (!sr){ sr = el("div", "sr-only"); sr.setAttribute("aria-live", "polite"); document.body.appendChild(sr); }
  sr.textContent = ""; setTimeout(function(){ sr.textContent = t; }, 30);
}

// ---------------------------------------------------------------- 体裁
function css(){
  var s = document.createElement("style"); s.id = "deck-panes-css";
  var F = "font:14px/1.2 -apple-system,BlinkMacSystemFont,'Hiragino Sans','Segoe UI',sans-serif";
  s.textContent =
  // 本の窓：テーマの地と字の色。舞台より上（台本の縮図に置く舞台はさらに上）
  "#deck-text{position:fixed;top:0;bottom:0;left:0;z-index:20;display:flex;flex-direction:column;background:var(--bg);color:var(--fg);font-family:var(--font-sans)}" +
  "#deck-text[hidden],#deck-split[hidden],#deck-readin[hidden],#deck-backplay[hidden],#deck-text button[hidden]{display:none}" +
  "#deck-text .dx-head{flex:none;display:flex;align-items:center;gap:6px;padding:6px 10px;border-bottom:1px solid var(--line,rgba(127,127,127,.35))}#deck-text .dx-gap{flex:1}" +
  "#deck-text button,#deck-ov button,#deck-layouts button,#deck-readin,#deck-backplay{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:4px 10px;border-radius:8px;cursor:pointer;" + F + "}" +
  "#deck-text .dx-head button,#deck-text .dx-watch{color:var(--fg);border:1px solid var(--line,rgba(127,127,127,.45))}" +
  "#deck-text .dx-head button:hover,#deck-text .dx-watch:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}" +
  "#deck-text svg,#deck-ov svg,#deck-readin svg,#deck-backplay svg{flex:none;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}" +
  "#deck-text button:focus-visible,#deck-text a:focus-visible,#deck-ov button:focus-visible,#deck-layouts button:focus-visible,#deck-readin:focus-visible,#deck-backplay:focus-visible,#deck-split:focus-visible{outline:3px solid #2563eb;outline-offset:2px}" +
  "#deck-text .dx-body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;outline:none;position:relative}" +
  "#deck-text .dx-body:focus-visible{box-shadow:inset 0 0 0 3px #2563eb}" +
  // 縦書きの本：窓の本文の欄ごと縦書きにし、右端から始めて左へ送る。行の長さは 40em まで（上下の真ん中）
  "#deck-text .dx-body.dx-vertical{writing-mode:vertical-rl;overflow-x:auto;overflow-y:hidden}" +
  "#deck-text .dx-body:not(.dx-vertical) #egatari-article{padding-bottom:40vh}#deck-text .dx-vertical #egatari-article{padding-block-end:30vw;max-width:none;max-height:40em;height:100%;box-sizing:border-box;margin-block:0;margin-inline:auto;overflow:visible;font-family:var(--font-mincho)}" +
  "#deck-text #egatari-article h2 :focus,#deck-text #egatari-article h2:focus{outline:none}" +
  // 今の所の印：左の線（縦書きは上の線）。色だけに頼らない（線の形と aria-current）
  "#deck-text section[data-section-id],#deck-text .dx-step{border-inline-start:4px solid transparent;padding-inline-start:12px}" +
  "#deck-text section[data-section-id].dx-cur,#deck-text .dx-step.dx-cur{border-inline-start-color:var(--emph,currentColor)}" +
  // スライドで見る（節の見出しの後ろ）：本だけの並べ方のとき
  "#deck-text .dx-watch{margin:0 0 .6em;font-size:13px;min-height:28px}html:not([data-deck-layout=book]) #deck-text .dx-watch{display:none}" +
  // 台本で読む
  "#deck-text .dx-script{max-width:44em;margin:0 auto;padding:12px 18px 40vh;line-height:1.8;font-size:17px}" +
  "#deck-text .dx-stitle{font-size:1.05em;margin:1.6em 0 .5em;display:flex;gap:.6em;align-items:baseline}#deck-text .dx-no{color:var(--muted,inherit);font-variant-numeric:tabular-nums}" +
  "#deck-text .dx-thumb{display:block;width:100%;max-width:640px;min-height:0;margin:0 auto .6em;padding:0;border-radius:4px;outline:1px solid var(--line,rgba(127,127,127,.45));background:var(--bg)}" +
  "#deck-text .dx-tbox{display:block;position:relative;width:100%;aspect-ratio:16/9;overflow:hidden}" +
  "#deck-text .dx-tbox>.slide{position:absolute!important;left:0;top:0;transform-origin:0 0;transform:scale(var(--dx-s,.3));pointer-events:none}" +
  "html[data-deck-layout=book] #deck-text .dx-thumb{position:sticky;top:0;z-index:1}" +
  "html[data-deck-layout=split] #deck-text .dx-thumb{max-width:min(100%,360px);margin-left:0}" +
  "#deck-text .dx-thumb.dx-live .dx-tbox{visibility:hidden}" +
  "#deck-text .dx-role{font-weight:600;color:var(--muted,inherit)}#deck-text .dx-step p{margin:.2em 0}" +
  // 本だけ：舞台は本の窓の下（押せない）。台本で読むときは今のスライドの縮図の場所に、窓より上に置く
  "html[data-deck-layout=book] #stage{pointer-events:none}html.deck-live #stage{z-index:22}" +
  "html[data-deck-layout=book] #dt-cb,html[data-deck-layout=book] #dt-handle,html[data-deck-layout=book] #dt-hint,html[data-deck-layout=book] #deck-back{display:none}" +
  // 仕切り
  "#deck-split{position:fixed;top:0;bottom:0;width:" + DIV + "px;z-index:21;cursor:col-resize;touch-action:none;background:var(--stage-bg,#2f2f2f)}" +
  "#deck-split::after{content:'';position:absolute;left:3px;top:50%;width:3px;height:36px;margin-top:-18px;border-radius:2px;background:rgba(255,255,255,.5)}" +
  "#deck-split:hover::after,#deck-split.drag::after,#deck-split:focus-visible::after{background:#fff}" +
  // 本で読む（舞台の右上）・再生中の所に戻る（本の窓の下）
  // 本で読む：発表の画面に出たままにしない。ツールバーと一緒に出て隠れる（キーボードで選んだときは出す）。埋め込みで操作を隠したときは出さない
  "#dt-cb:not(.show)~#deck-readin:not(:focus-visible){opacity:0;pointer-events:none}html.deck-nocontrols #deck-readin,html.deck-nocontrols #deck-text .dx-play,html.deck-nocontrols #deck-text .dx-view{display:none}" +
  "#deck-readin{transition:opacity .25s;position:fixed;z-index:30;color:#fff;background:rgba(20,20,20,.74);box-shadow:0 2px 10px rgba(0,0,0,.18);opacity:.9}#deck-readin:hover{opacity:1;background:rgba(20,20,20,.9)}" +
  "#deck-backplay{position:fixed;bottom:18px;z-index:30;transform:translateX(-50%);color:#fff;background:rgba(20,20,20,.86);box-shadow:0 2px 12px rgba(0,0,0,.25);padding:8px 14px;border-radius:999px}" +
  // 並べ方の選択
  "#deck-layouts{position:fixed;z-index:45;min-width:200px;padding:4px;border-radius:10px;background:#fff;color:#1a1a1a;box-shadow:0 8px 28px rgba(0,0,0,.3);display:flex;flex-direction:column}" +
  "#deck-layouts .dx-mi{padding:7px 10px;border-radius:6px}#deck-layouts .dx-mi:hover,#deck-layouts .dx-mi:focus{background:#e8eefc}#deck-layouts .dx-check{display:inline-block;width:1.2em}" +
  // スライドで見る（重ね）：暗い地の上に舞台。上に題と閉じる、下に前へ・自動再生・次へ
  "#deck-ov{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.72)}.deck-ov-open #stage{z-index:41;pointer-events:auto}" +
  ".deck-ov-open #dt-cb,.deck-ov-open #dt-handle,.deck-ov-open #deck-readin,.deck-ov-open #deck-backplay{display:none}" +
  "#deck-ov .dx-ovbox{outline:none}#deck-ov .dx-ovtop,#deck-ov .dx-ovbot{position:fixed;z-index:42;display:flex;align-items:center;gap:8px;color:#fff;" + F + "}" +
  "#deck-ov .dx-ovtop,#deck-ov .dx-ovbot{box-sizing:border-box;padding:0 8px}@media (max-width:639px),(max-height:479px){#deck-ov{background:#000}}" +
  "#deck-ov .dx-ovtop{justify-content:space-between;height:42px}#deck-ov .dx-ovbot{justify-content:center;height:42px}#deck-ov .dx-ovtitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  "#deck-ov button{color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35)}#deck-ov button:hover{background:rgba(255,255,255,.24)}" +
  "@media (max-width:639px){#deck-ov .dx-ovbot .lab,#deck-text .dx-head .dx-play .lab{display:none}}" +
  "@media print{#deck-text,#deck-split,#deck-readin,#deck-backplay,#deck-ov,#deck-layouts{display:none!important}html[data-deck-layout] #stage{clip-path:none!important}}";
  document.head.appendChild(s);
}

// ---------------------------------------------------------------- 起動（deck:ready の後。kit/tools.js の帯の「表示」のボタンは DECK.panes を見る）
function init(){
  ART = document.getElementById("egatari-article");
  HAS_ART = !!(ART && ART.textContent.trim());
  if (!slides().length) return;
  T = words();
  css();
  if (EMBED && /^(0|false|no|off)$/i.test(Q.get("controls") || "")) html.classList.add("deck-nocontrols");
  var r = parseFloat(stored("split"));
  P.ratio = r >= 0 && r <= 1 ? r : null;
  var st = DECK.state && DECK.state();
  if (st) P.pos = {i: st.slide - 1, k: st.step};
  if (HAS_ART) articleMaps();
  html.setAttribute("data-deck-layout", "slides");
  var first = initialLayout();
  if (first !== "slides") setLayout(first, {focus: false});
  placeReadIn();
}
DECK.panes = {
  menu: function(anchor){ if (DECK.ready && T) menu(anchor); },
  // 試験と埋め込みの手前の口：並べ方を読む・替える（名前は slides・book・split か仕様の flow・pages）
  layout: function(name){ if (name && T) setLayout(SPEC_IN[name] || name, {persist: true}); return P.layout; },
  state: function(){
    return {layout: P.layout, detached: P.detached, playing: P.playing, overlay: !!P.ov, article: HAS_ART, vertical: P.vertical,
      ratio: P.layout === "split" && P.splitStage ? P.splitStage.w / innerWidth : null,
      marked: P.marked ? (P.marked.getAttribute("data-section-id") || P.marked.getAttribute("data-step-key") || "") : null};
  },
  // キーの一覧（kit/tools.js の ?）の r の行：並べ方の名前の順
  order: function(){ return T ? [T.slides, T.split, T.book].join(" → ") : ""; },
  watch: function(i, k){ if (T) openOverlay(i, k || 0, null); },
  close: function(){ closeOverlay(); }
};
if (DECK.ready) init(); else document.addEventListener("deck:ready", init);
})();
