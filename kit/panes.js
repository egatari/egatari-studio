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
// - 読むための道具（Player P2 Reading aids、v0.6.5 C）：目次・本の中の検索（縦書きでも、本の全体から）・リンクで飛んだ後の「戻る」・
//   この端末で「前回の続きから」・進行状況の細い線・文字サイズ（6 段）と行間（2 段）と背景（白・セピア・黒。本の窓だけ。Readium CSS の
//   ユーザー設定にならう。この端末に覚え、ファイルには書かない）・図を押して拡大・再生中に読み上げている話を台本で読むで強調
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
  anchors: [], secOf: [], marked: null, detached: false, playing: false, userAt: 0, progAt: 0, progUntil: 0, fromText: false,
  ratio: null, splitStage: null, ov: null, back: [], readBack: null, live: null, menu: null, menuFrom: null, bp: null, readIn: null, pos: {i: 0, k: 0},
  pop: null, find: null, prog: null, fig: null, say: null, resume: null, rs: {size: 1, lh: "normal", bg: "white"}};

function store(k, v){ try { if (v === null) localStorage.removeItem(KEY + k); else localStorage.setItem(KEY + k, v); } catch (e) {} }
function stored(k){ try { return localStorage.getItem(KEY + k); } catch (e) { return null; } }
function docId(){ return (DECK.META && typeof DECK.META.docId === "string" && DECK.META.docId) || location.pathname; }
function docKey(){ return "layout:" + docId(); }
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
  follow: '<path d="M8 2.5v9M4 8l4 4 4-4"/>',
  toc: '<path d="M5.6 4h8M5.6 8h8M5.6 12h8M2.4 4h.4M2.4 8h.4M2.4 12h.4"/>',
  find: '<circle cx="6.8" cy="6.8" r="4.3"/><path d="M10 10l4 4"/>',
  text: '<path d="M1.6 13l3.6-9.6L8.8 13M2.9 9.6h4.6M10.4 8.6c.5-.8 1.3-1.2 2.2-1.1 1 .1 1.6.8 1.6 1.9V13M14.2 10.4c-2.4-.1-3.8.4-3.8 1.5 0 .8.6 1.2 1.4 1.1 1.2-.1 2.4-.9 2.4-2.4"/>',
  up: '<path d="M3.5 10l4.5-4.5 4.5 4.5"/>', down: '<path d="M3.5 6l4.5 4.5 4.5-4.5"/>'
};

// ---------------------------------------------------------------- 本の窓の中身
var ART = null, HAS_ART = false, T = null;
// 画面の言葉（docs/terms.json：book・read-with-script・slides-and-book・read-in-book・watch-on-slides・back-to-playing）
function words(){
  return {view: L("表示", "View"), slides: L("スライド", "Slides"),
    book: HAS_ART ? L("本", "Book") : L("台本で読む", "Read with script"),
    split: HAS_ART ? L("スライドと本", "Slides and book") : L("スライドと台本", "Slides and script"),
    divider: HAS_ART ? L("スライドと本の境目", "Divider between slides and book") : L("スライドと台本の境目", "Divider between slides and script"),
    readIn: L("本で読む", "Read in the book"), watch: L("スライドで見る", "Watch on slides"),
    backPlay: L("再生中の所に戻る", "Back to the playing part"), back: L("戻る", "Back"), close: L("閉じる", "Close"),
    prev: L("前へ", "Previous"), next: L("次へ", "Next"), play: L("自動再生", "Autoplay"), stop: L("自動再生を止める", "Stop autoplay"),
    // 読むための道具（docs/terms.json：contents・book-background。ほかは王道の言い方）
    contents: L("目次", "Contents"), search: L("検索", "Search"),
    searchIn: HAS_ART ? L("本の中を検索", "Search in the book") : L("台本の中を検索", "Search in the script"),
    prevHit: L("前の検索結果", "Previous result"), nextHit: L("次の検索結果", "Next result"), noHit: L("見つかりません", "No results"),
    text: L("文字と背景", "Text and background"), size: L("文字サイズ", "Text size"), smaller: L("文字を小さく", "Smaller text"), larger: L("文字を大きく", "Larger text"),
    spacing: L("行間", "Line spacing"), normal: L("標準", "Normal"), wide: L("広い", "Wide"),
    bg: L("背景", "Background"), white: L("白", "White"), sepia: L("セピア", "Sepia"), black: L("黒", "Black"),
    resumed: L("前回の続きから", "Resumed where you left off"), fromStart: L("最初から", "Start over"),
    progress: L("進行状況", "Progress"), enlarge: L("拡大", "Enlarge")};
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
  P.pane.toggleAttribute("data-dx-v", P.vertical);
  articleMaps();
  // 「スライドで見る」：スライドにつながる節の見出しの後ろ（本だけの並べ方で出す。横並びでは舞台が隣にある）
  P.anchors.forEach(function(a){
    var h = a.el === a.sec && a.i !== null && a.sec.querySelector("h2");
    if (!h) return;
    var b = btn("dx-watch", T.watch, ICON.watch, function(b){ openOverlay(a.i, a.k, b); });
    b.setAttribute("aria-label", T.watch + L("：", ": ") + (titleOf(slides()[a.i]) || String(a.i + 1)));
    h.parentNode.insertBefore(b, h.nextSibling);
  });
  // 図は押すと拡大（C5）：画像をボタンとして読ませ、Enter・Space でも開く
  [].forEach.call(ART.querySelectorAll("figure.egatari-figure img"), function(img){
    if (img.closest("a[href]")) return;
    img.tabIndex = 0; img.setAttribute("role", "button"); img.classList.add("dx-zoom");
    img.setAttribute("aria-label", T.enlarge + L("：", ": ") + (img.getAttribute("alt") || figTitle(img) || ""));
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
  var toc = btn("dx-toc", T.contents, ICON.toc, function(b){ openToc(b); });
  var find = btn("dx-find", T.search, ICON.find, function(){ openFind(); });
  find.setAttribute("aria-keyshortcuts", "Control+F Meta+F");
  var text = btn("dx-text", T.text, ICON.text, function(b){ openText(b); });
  [toc, text].forEach(function(b){ b.setAttribute("aria-haspopup", "dialog"); b.setAttribute("aria-expanded", "false"); });
  [back, toc, find, el("span", "dx-gap"), play, text, view].forEach(function(x){ head.appendChild(x); });
  pane.appendChild(head);
  pane.appendChild(findBar());
  // 進行状況（C3）：本の窓の上の細い線。ページの番号は出さない（ページ分けは GA の後。番号は窓だけのもの、Player P2）
  var pr = P.prog = el("div", "dx-prog"); pr.setAttribute("role", "progressbar"); pr.setAttribute("aria-label", T.progress);
  pr.setAttribute("aria-valuemin", "0"); pr.setAttribute("aria-valuemax", "100"); pr.appendChild(el("span"));
  pane.appendChild(pr);
  var body = P.body = el("div", "dx-body"); body.tabIndex = 0;
  body.setAttribute("aria-label", T.book);
  pane.appendChild(body);
  applyReading();
  document.body.appendChild(pane);
  if (HAS_ART) buildArticle(); else buildScript();
  // 見る人の動かし方（ホイール・指・つまみ・キー）：その後のスクロールは見る人のもの（付いていくのをやめる・位置を動かす）
  // 再生器が動かしている途中（滑らかなスクロール）なら、そこで止める（見る人の動かし方を上書きしない）
  var mine = function(){
    P.userAt = Date.now();
    if (P.userAt < P.progUntil){ P.progUntil = 0; body.scrollTo({left: body.scrollLeft, top: body.scrollTop, behavior: "auto"}); }
  };
  ["pointerdown", "touchstart", "touchmove", "keydown"].forEach(function(n){ body.addEventListener(n, mine, {passive: true}); });
  body.addEventListener("pointermove", function(e){ if (e.buttons) P.userAt = Date.now(); }, {passive: true});   // つまみを押したまま動かす
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
  d.setAttribute("role", "separator"); d.setAttribute("aria-orientation", "vertical"); d.setAttribute("aria-label", T.divider);
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
  P.progAt = Date.now(); P.progUntil = P.progAt + (o.behavior === "smooth" ? 900 : 150);
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
  if (!scrollRaf) scrollRaf = requestAnimationFrame(function(){ scrollRaf = 0; scrolled(); progress(); });
  saveSoon();
}
function scrolled(){
  if (P.ov || P.layout === "slides") return;
  var now = Date.now();
  // 見る人が動かしたスクロールだけを見る（ホイール・指・つまみ・キーの直後）。付いていくための（再生器の）スクロールや、窓の大きさが変わって動いたのは見ない
  if (!(now - P.userAt < 1200) || P.userAt < P.progAt) return;
  if (P.playing){
    // 再生中に見る人がスクロールした：付いていくのをやめる（再生は続け、位置も動かさない）
    if (!P.detached){ P.detached = true; P.bp.hidden = false; placeBackPlay(); hideResume(); }
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
  saveSoon();
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
  var z = e.target.closest && e.target.closest("img.dx-zoom");
  if (z && e.button === 0){ e.preventDefault(); e.stopPropagation(); openFig(z); return; }
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
  scrollToEl(t, false);
  P.userAt = Date.now();   // 見る人が選んだ移動：読む所が動いたものとして舞台も付いてくる
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
  closePop(true); closeFig();
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
  if (P.body){ P.progAt = Date.now(); P.progUntil = P.progAt + 150; P.body.scrollTo({left: o.left, top: o.top}); }
  mark(P.pos.i, P.pos.k);
  if (o.from && o.from.isConnected && o.from !== document.body) try { o.from.focus({preventScroll: true}); } catch (e) {}
  else if (P.body && P.layout !== "slides") P.body.focus({preventScroll: true});
}

// ---------------------------------------------------------------- 読むための道具（Player P2 Reading aids。v0.6.5 C）
// 開いて閉じる小さな箱（目次・文字と背景）：ボタンの下に出し、Esc・外を押す・フォーカスが外へ出ると閉じて、ボタンにフォーカスを返す
function openPop(kind, label, anchor, fill){
  var again = P.pop && P.pop.kind === kind;
  closePop(true);
  if (again) return null;
  var m = el("div", "dx-pop"); m.id = "deck-" + kind; m.setAttribute("role", "dialog"); m.setAttribute("aria-label", label);
  P.pop = {kind: kind, el: m, from: anchor};
  var first = fill(m);
  m.addEventListener("keydown", function(e){
    if (e.key === "Escape"){ e.preventDefault(); closePop(); }
    e.stopPropagation();   // 箱の中のキーは舞台の送り（←→ など）にしない。ラジオボタンの ←→ はブラウザのまま
  });
  m.addEventListener("focusout", function(e){ if (P.pop && P.pop.el === m && e.relatedTarget && !m.contains(e.relatedTarget)) closePop(true); });
  ["pointerdown", "mousedown"].forEach(function(n){ m.addEventListener(n, function(e){ e.stopPropagation(); }); });
  document.body.appendChild(m);
  var r = anchor.getBoundingClientRect(), mh = m.offsetHeight, mw = m.offsetWidth;
  m.style.left = Math.max(6, Math.min(innerWidth - mw - 6, r.left)) + "px";
  m.style.top = (r.bottom + mh + 6 < innerHeight ? r.bottom + 4 : Math.max(6, r.top - mh - 4)) + "px";
  anchor.setAttribute("aria-expanded", "true");
  if (first) first.focus();
  setTimeout(function(){ document.addEventListener("pointerdown", popOutside, true); }, 0);
  return m;
}
function popOutside(e){ if (P.pop && !P.pop.el.contains(e.target) && !P.pop.from.contains(e.target)) closePop(true); }
function closePop(noFocus){
  var o = P.pop;
  if (!o) return;
  document.removeEventListener("pointerdown", popOutside, true);
  P.pop = null; o.el.remove();
  o.from.setAttribute("aria-expanded", "false");
  if (!noFocus && o.from.isConnected) try { o.from.focus({preventScroll: true}); } catch (e) {}
}
// 読み進める所（窓の初めから 4 分の 1 の線）の位置まで動かす：要素 e の初めをその線から d だけ前に
function scrollAlong(e, d){
  var b = rectOf(P.body), line = (P.vertical ? b.width : b.height) * .25, x = along(e, b) - (line - d);
  P.progAt = Date.now(); P.progUntil = P.progAt + 150;
  if (P.vertical) P.body.scrollLeft -= x; else P.body.scrollTop += x;
}
// 見る人が選んだ移動（目次・検索）：その所へ動かし、読む所が動いたものとして舞台も付いてくる（再生中なら離れる）
function userJump(e, back){
  if (back) P.back.push({left: P.body.scrollLeft, top: P.body.scrollTop, el: back});
  scrollToEl(e, false);
  P.userAt = Date.now();
  syncBackBtn();
}

// ---- 目次（C1）：章と節（本がなければスライドの題）。今読んでいる所に印（太字と線、aria-current）
function tocItems(){
  if (!HAS_ART) return [].map.call(P.body.querySelectorAll(".dx-slide > .dx-stitle"), function(h){ return {el: h, lv: 1, text: h.textContent.replace(/\s+/g, " ").trim()}; });
  var out = [];
  [].forEach.call(ART.querySelectorAll("section[data-egatari-chapter] > header > h1, section[data-section-id] > h2"), function(h){
    var c = h.cloneNode(true);
    [].forEach.call(c.querySelectorAll("rt, rp, .katex-mathml, [aria-hidden=true]"), function(x){ x.remove(); });
    out.push({el: h.tagName === "H1" ? h.closest("section") : h, lv: h.tagName === "H1" ? 0 : 1, text: c.textContent.replace(/\s+/g, " ").trim()});
  });
  return out;
}
function tocCurrent(items){
  var b = rectOf(P.body), line = (P.vertical ? b.width : b.height) * .25, cur = 0;
  for (var j = 0; j < items.length; j++) if (along(items[j].el, b) <= line) cur = j;
  return items.length ? cur : -1;
}
function openToc(anchor){
  var items = tocItems(), cur = tocCurrent(items), bs = [];
  openPop("toc", T.contents, anchor, function(m){
    var nav = el("nav"); nav.setAttribute("aria-label", T.contents);
    var ol = el("ol");
    items.forEach(function(it, j){
      var li = el("li"), b = el("button", "dx-ti dx-l" + it.lv, it.text); b.type = "button";
      if (j === cur){ b.setAttribute("aria-current", "location"); b.classList.add("dx-here"); }
      b.addEventListener("click", function(e){
        e.preventDefault(); e.stopPropagation();
        closePop(true);
        userJump(it.el, anchor);
        var h = it.el.tagName === "SECTION" ? it.el.querySelector("h1") : it.el;
        if (h){ if (!h.hasAttribute("tabindex")) h.tabIndex = -1; h.focus({preventScroll: true}); }
      });
      bs.push(b); li.appendChild(b); ol.appendChild(li);
    });
    nav.appendChild(ol); m.appendChild(nav);
    m.addEventListener("keydown", function(e){
      var j = bs.indexOf(document.activeElement);
      if (e.key === "ArrowDown") bs[(j + 1) % bs.length].focus();
      else if (e.key === "ArrowUp") bs[(j - 1 + bs.length) % bs.length].focus();
      else if (e.key === "Home") bs[0].focus(); else if (e.key === "End") bs[bs.length - 1].focus();
      else return;
      e.preventDefault();
    });
    return bs[cur] || bs[0] || null;
  });
  if (bs[cur]) bs[cur].scrollIntoView({block: "nearest"});
}

// ---- 本の中の検索（C1）：本の窓の字の全体から（縦書きも、要素をまたいでも）。空白は見ず、全角・半角と大文字・小文字をそろえる
function findBar(){
  var bar = el("div", "dx-findbar"); bar.setAttribute("role", "search"); bar.hidden = true;
  var inp = el("input"); inp.type = "search"; inp.setAttribute("aria-label", T.searchIn); inp.placeholder = T.searchIn;
  inp.setAttribute("enterkeyhint", "search"); inp.autocomplete = "off"; inp.spellcheck = false;
  var cnt = el("span", "dx-count"); cnt.setAttribute("role", "status"); cnt.setAttribute("aria-live", "polite");
  var pv = btn("dx-fprev", T.prevHit, ICON.up, function(){ hit(-1); }), nx = btn("dx-fnext", T.nextHit, ICON.down, function(){ hit(1); });
  var cl = btn("dx-fclose", T.close, ICON.close, function(){ closeFind(); });
  [pv, nx, cl].forEach(function(b){ b.setAttribute("aria-label", b.textContent); b.classList.add("dx-icon"); });
  pv.setAttribute("aria-keyshortcuts", "Shift+Enter"); nx.setAttribute("aria-keyshortcuts", "Enter"); cl.setAttribute("aria-keyshortcuts", "Escape");
  var t = 0;
  inp.addEventListener("input", function(){ clearTimeout(t); t = setTimeout(function(){ runFind(inp.value); }, 120); });
  inp.addEventListener("keydown", function(e){
    if (e.key === "Enter"){ e.preventDefault(); clearTimeout(t); if (P.find.q !== fold(inp.value).s) runFind(inp.value); else hit(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape"){ e.preventDefault(); closeFind(); }
    e.stopPropagation();
  });
  [inp, cnt, pv, nx, cl].forEach(function(x){ bar.appendChild(x); });
  P.find = {bar: bar, inp: inp, cnt: cnt, hits: [], cur: -1, q: "", idx: null};
  return bar;
}
function openFind(){
  if (!P.find) return;
  closePop(true);
  P.find.bar.hidden = false;
  P.find.inp.focus(); P.find.inp.select();
}
function closeFind(){
  var f = P.find;
  if (!f || f.bar.hidden) return;
  f.bar.hidden = true;
  paint(null);
  var b = P.head.querySelector(".dx-find");
  if (b) b.focus({preventScroll: true});
}
// 字を 1 つずつそろえる（NFKC と小文字）。空白は落とす。もとの字の所（テキストのノードと位置）を覚える
function fold(str, nodeAt){
  var s = "", map = [];
  for (var o = 0; o < str.length; ){
    var c = str.codePointAt(o), ch = String.fromCodePoint(c);
    if (!/\s/.test(ch)){ var n = ch.normalize("NFKC").toLowerCase(); s += n; if (nodeAt) for (var j = 0; j < n.length; j++) map.push(nodeAt(o, ch.length)); }
    o += ch.length;
  }
  return {s: s, map: map};
}
function nodeAt(n){ return function(o, len){ return [n, o, o + len]; }; }
var NOFIND = "button, rt, rp, script, style, .katex-mathml, .dx-tbox, [aria-hidden=true]";
function findIndex(){
  var s = "", map = [], w = document.createTreeWalker(P.body, NodeFilter.SHOW_TEXT, {acceptNode: function(n){
    var p = n.parentElement;
    return p && !p.closest(NOFIND) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
  }});
  for (var n; (n = w.nextNode()); ){
    var f = fold(n.data, nodeAt(n));
    s += f.s; for (var j = 0; j < f.map.length; j++) map.push(f.map[j]);
  }
  return {s: s, map: map};
}
function runFind(q){
  var f = P.find, x = fold(q || "").s;
  f.q = x; f.hits = []; f.cur = -1;
  if (x){
    if (!f.idx) f.idx = findIndex();
    var S = f.idx.s, M = f.idx.map;
    for (var j = S.indexOf(x); j >= 0 && f.hits.length < 1000; j = S.indexOf(x, j + x.length)){
      var a = M[j], z = M[j + x.length - 1], r = document.createRange();
      r.setStart(a[0], a[1]); r.setEnd(z[0], z[2]);
      f.hits.push(r);
    }
  }
  // 窓に見えている所から後の最初の結果から（なければ初めの結果）
  if (f.hits.length){
    var b = rectOf(P.body), j0 = 0;
    for (var j2 = 0; j2 < f.hits.length; j2++){ var rr = f.hits[j2].getBoundingClientRect(); if ((P.vertical ? b.right - rr.right : rr.top - b.top) >= -1){ j0 = j2; break; } }
    f.cur = j0 - 1;
    hit(1);
  } else { paint(null); f.cnt.textContent = x ? T.noHit : ""; }
}
function hit(d){
  var f = P.find;
  if (!f || !f.hits.length) return;
  f.cur = (f.cur + d + f.hits.length) % f.hits.length;
  var r = f.hits[f.cur];
  paint(r);
  f.cnt.textContent = (f.cur + 1) + " / " + f.hits.length;
  // 見えていなければ、読み進める線の少し前に出す
  var b = rectOf(P.body), q = r.getBoundingClientRect();
  var inView = P.vertical ? q.left >= b.left + 8 && q.right <= b.right - 8 : q.top >= b.top + 8 && q.bottom <= b.bottom - 8;
  if (!inView){
    var x = (P.vertical ? b.right - q.right : q.top - b.top) - (P.vertical ? b.width : b.height) * .3;
    P.progAt = Date.now(); P.progUntil = P.progAt + 150;
    if (P.vertical) P.body.scrollLeft -= x; else P.body.scrollTop += x;
    P.userAt = Date.now();
  }
}
// 結果の色づけ：CSS の Custom Highlight（本文の DOM を書き換えない）。今の結果は色に加えて下線（色だけに頼らない）
function paint(cur){
  var H = window.CSS && CSS.highlights, f = P.find;
  if (!H || typeof Highlight !== "function") return;
  if (!cur){ H.delete("dx-find"); H.delete("dx-find-cur"); return; }
  var all = new Highlight();
  f.hits.forEach(function(r){ all.add(r); });
  H.set("dx-find", all);
  H.set("dx-find-cur", new Highlight(cur));
}

// ---- 進行状況（C3）
function progress(){
  if (!P.prog || !P.body) return;
  var b = P.body, max = P.vertical ? b.scrollWidth - b.clientWidth : b.scrollHeight - b.clientHeight;
  var f = max > 0 ? Math.min(1, Math.max(0, (P.vertical ? -b.scrollLeft : b.scrollTop) / max)) : 0, pc = Math.round(f * 100);
  P.prog.firstChild.style.transform = "scaleX(" + f + ")";
  if (P.prog.getAttribute("aria-valuenow") !== String(pc)){ P.prog.setAttribute("aria-valuenow", String(pc)); P.prog.setAttribute("aria-valuetext", pc + "%"); }
}

// ---- 文字サイズ・行間・背景（C4）：この端末に覚える（教材ごとでなく、この端末のすべての教材で）。ファイルには書かない
var SIZES = [.85, 1, 1.15, 1.3, 1.5, 1.75];
function loadReading(){
  var z = parseFloat(stored("read-size")), lh = stored("read-lh"), bg = stored("read-bg");
  P.rs = {size: SIZES.indexOf(z) >= 0 ? z : 1, lh: lh === "wide" ? "wide" : "normal", bg: /^(sepia|black)$/.test(bg || "") ? bg : "white"};
}
function applyReading(){
  if (!P.pane) return;
  P.pane.style.setProperty("--dx-fs", String(P.rs.size));
  P.pane.setAttribute("data-dx-lh", P.rs.lh);
  P.pane.setAttribute("data-dx-bg", P.rs.bg);
}
function setReading(k, v){
  var a = readAnchor(), b = rectOf(P.body), d = a ? (P.vertical ? b.width : b.height) * .25 - along(a.el, b) : 0;
  P.rs[k] = v;
  store("read-" + k, String(v));
  applyReading();
  if (P.find) P.find.idx = null;
  // 字の大きさが変わっても、読んでいた所を窓に残す
  if (a) scrollAlong(a.el, d);
  progress();
}
function openText(anchor){
  openPop("reading", T.text, anchor, function(m){
    var row = el("div", "dx-row"); row.setAttribute("role", "group");
    var lab = el("span", "dx-legend", T.size); lab.id = "deck-size-l"; row.setAttribute("aria-labelledby", lab.id);
    var out = el("output", "dx-size");
    var sm = btn("dx-icon", T.smaller, null, function(){ step(-1); }), lg = btn("dx-icon", T.larger, null, function(){ step(1); });
    sm.insertBefore(el("span", "dx-a dx-a-s", "A"), sm.firstChild); lg.insertBefore(el("span", "dx-a dx-a-l", "A"), lg.firstChild);
    [sm, lg].forEach(function(b){ b.setAttribute("aria-label", b.querySelector(".lab").textContent); });
    var show = function(){
      var j = SIZES.indexOf(P.rs.size);
      out.textContent = Math.round(P.rs.size * 100) + "%";
      sm.disabled = j <= 0; lg.disabled = j >= SIZES.length - 1;
    };
    var step = function(d){ var j = SIZES.indexOf(P.rs.size) + d; if (j >= 0 && j < SIZES.length){ setReading("size", SIZES[j]); show(); } };
    [lab, sm, out, lg].forEach(function(x){ row.appendChild(x); });
    m.appendChild(row);
    show();
    var radios = function(name, title, opts){
      var fs = el("fieldset", "dx-row"), lg2 = el("legend", "dx-legend", title);
      fs.appendChild(lg2);
      opts.forEach(function(o){
        var l = el("label", "dx-opt" + (name === "bg" ? " dx-bg" : "")), r = el("input"); r.type = "radio"; r.name = "deck-read-" + name; r.value = o[0]; r.checked = P.rs[name] === o[0];
        r.addEventListener("change", function(){ if (r.checked) setReading(name, o[0]); });
        l.appendChild(r);
        if (name === "bg") l.appendChild(el("span", "dx-sw dx-sw-" + o[0])).setAttribute("aria-hidden", "true");
        l.appendChild(el("span", "", o[1]));
        fs.appendChild(l);
      });
      m.appendChild(fs);
    };
    radios("lh", T.spacing, [["normal", T.normal], ["wide", T.wide]]);
    radios("bg", T.bg, [["white", T.white], ["sepia", T.sepia], ["black", T.black]]);
    return sm.disabled ? lg : sm;
  });
}

// ---- 図を押して拡大（C5）。小さなスライドは「スライドで見る」の重ね（openOverlay）
function figTitle(img){ var f = img.closest("figure"), c = f && f.querySelector("figcaption"); return c ? c.textContent.replace(/\s+/g, " ").trim() : ""; }
function openFig(img){
  closeFig(); closePop(true);
  var ov = el("div"); ov.id = "deck-fig";
  var dlg = el("div", "dx-figbox"); dlg.setAttribute("role", "dialog"); dlg.setAttribute("aria-modal", "true"); dlg.tabIndex = -1;
  var top = el("div", "dx-ovtop"), ttl = el("span", "dx-ovtitle", figTitle(img) || img.getAttribute("alt") || T.enlarge); ttl.id = "deck-fig-title";
  dlg.setAttribute("aria-labelledby", ttl.id);
  var close = btn("dx-close", T.close, ICON.close, function(){ closeFig(); });
  close.setAttribute("aria-keyshortcuts", "Escape");
  top.appendChild(ttl); top.appendChild(close);
  var big = el("img", "dx-figimg"); big.src = img.currentSrc || img.src; big.alt = img.getAttribute("alt") || "";
  // 画面の 9 割（上の帯の分を除く）に収まる大きさまで広げる（小さな画像も大きく見せる）
  var nw = img.naturalWidth || img.width || 1, nh = img.naturalHeight || img.height || 1, aw = innerWidth * .92, ah = innerHeight - 120;
  var k = Math.min(aw / nw, ah / nh);
  big.style.width = Math.round(nw * k) + "px"; big.style.height = Math.round(nh * k) + "px";
  dlg.appendChild(top); dlg.appendChild(big); ov.appendChild(dlg);
  ov.addEventListener("click", function(e){ if (e.target === ov || e.target === dlg) closeFig(); });
  ["pointerdown", "mousedown", "wheel"].forEach(function(n){ ov.addEventListener(n, function(e){ e.stopPropagation(); }); });
  document.body.appendChild(ov);
  var others = [P.pane, P.div, document.getElementById("stage"), document.getElementById("dt-cb"), document.getElementById("dt-handle"), P.bp, P.readIn].filter(Boolean);
  P.fig = {el: ov, from: img, close: close, inert: others.map(function(x){ var was = x.inert; x.inert = true; return [x, was]; })};
  dlg.focus({preventScroll: true});
}
function closeFig(){
  var f = P.fig;
  if (!f) return;
  P.fig = null; f.el.remove();
  f.inert.forEach(function(x){ x[0].inert = x[1]; });
  if (f.from.isConnected) try { f.from.focus({preventScroll: true}); } catch (e) {}
}

// ---- 前回の続きから（C2）：この端末に、教材ごとに読んでいた所（スライドとステップ、本の窓の目印とそこからの距離）を覚える
var saveT = 0;
function rKey(){ return "resume:" + docId(); }
function saveSoon(){ if (!P.resume || P.resume.restoring) return; clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
function saveNow(){
  if (!P.resume || P.resume.restoring) return;
  var s = slides()[P.pos.i], r = {s: s && s.id || null, i: P.pos.i, k: P.pos.k};
  if (P.pane && !P.pane.hidden && P.body.clientHeight){
    var a = readAnchor(), b = rectOf(P.body);
    if (a){ r.a = P.anchors.indexOf(a); r.d = Math.round((P.vertical ? b.width : b.height) * .25 - along(a.el, b)); }
    r.p = +P.prog.getAttribute("aria-valuenow") || 0;
  }
  store(rKey(), JSON.stringify(r));
}
function initResume(first){
  // 埋め込み・編集のプレビュー・# で場所を指して開いた（読み込み直しは除く）ときは使わない。スライドだけで開いたとき（発表）も使わない
  var nav = null; try { nav = performance.getEntriesByType("navigation")[0]; } catch (e) {}
  var ok = !EMBED && !window.DECK_DEV && (!DECK.openHash || (nav && nav.type === "reload"));
  if (!ok) return;
  P.resume = {restoring: true};
  addEventListener("pagehide", saveNow);
  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "hidden") saveNow(); });
  var r = null; try { r = JSON.parse(stored(rKey()) || "null"); } catch (e) {}
  var S = slides(), i = -1;
  if (r && typeof r === "object"){ for (var j = 0; j < S.length; j++) if (S[j].id && S[j].id === r.s){ i = j; break; } if (i < 0 && !r.s && r.i >= 0 && r.i < S.length) i = r.i; }
  var at = i >= 0 && P.anchors[r.a];
  if (first === "slides" || i < 0 || (i === 0 && !(r.k > 0) && !(r.a > 0) && !(r.p > 0))){ P.resume.restoring = false; return; }
  var k = Math.max(0, Math.min(S[i]._max, r.k | 0));
  P.fromText = true;
  try { DECK.move(i, k, false, "seek"); } finally { P.fromText = false; }
  mark(i, k);
  if (at) scrollAlong(at.el, +r.d || 0); else syncText(i, k, false);
  P.resume.restoring = false;
  progress();
  showResume();
}
function showResume(){
  var n = el("div"); n.id = "deck-resume"; n.setAttribute("role", "status");
  n.appendChild(el("span", "", T.resumed));
  var start = btn("", T.fromStart, null, function(){
    hideResume();
    P.fromText = true;
    try { DECK.move(0, 0, false, "seek"); } finally { P.fromText = false; }
    P.progAt = Date.now(); P.progUntil = P.progAt + 150;
    P.body.scrollTo({left: 0, top: 0});
    P.body.focus({preventScroll: true});
    mark(0, 0); saveSoon();
  });
  var x = btn("dx-icon", T.close, ICON.close, function(){ hideResume(); if (P.body) P.body.focus({preventScroll: true}); });
  x.setAttribute("aria-label", T.close);
  n.appendChild(start); n.appendChild(x);
  document.body.appendChild(n);
  var r = rectOf(P.pane); n.style.left = (r.left + r.width / 2) + "px";
  P.resumeN = n;
  // 一度だけの知らせ：10 秒で消す（指やフォーカスがある間は待つ）
  var t = function(){ P.resumeT = setTimeout(function(){ if (n.matches(":hover, :focus-within")) t(); else hideResume(); }, 10000); };
  t();
}
function hideResume(){ if (P.resumeN){ clearTimeout(P.resumeT); P.resumeN.remove(); P.resumeN = null; } }

// ---- 再生中に読み上げている話を強調する（台本で読む。Player P2 SHOULD）。今のステップの線に加えて地の色（色だけに頼らない：線がある）
document.addEventListener("deck:turn", function(e){
  var d = e.detail || {};
  if (P.say){ P.say.classList.remove("dx-say"); P.say = null; }
  if (!P.body || HAS_ART || d.j < 0) return;
  var s = slides()[d.i], b = s && P.body.querySelector('.dx-step[data-step-key="' + s._key + ":" + stepKeyOf(d.i, d.k) + '"]');
  var p = b && b.children[d.j];
  if (p){ p.classList.add("dx-say"); P.say = p; }
});

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
  if (document.getElementById("deck-extlink") || document.getElementById("dt-ov") || document.getElementById("deck-black") || P.menu || P.pop) return;
  var k = e.key, mod = e.metaKey || e.ctrlKey || e.altKey;
  var stop = function(){ e.preventDefault(); e.stopPropagation(); };
  if (P.fig){
    // 拡大した図：Esc で閉じる。Tab は閉じるのボタンから出さない。ほかのキーは効かせない
    if (k === "Escape"){ stop(); closeFig(); }
    else if (k === "Tab"){ stop(); P.fig.close.focus(); }
    else if (!((k === "Enter" || k === " ") && e.target === P.fig.close)) e.stopPropagation();
    return;
  }
  // 本の中の検索：Ctrl+F・⌘F（本だけの並べ方か、本の窓にフォーカスがあるとき。ブラウザの検索は縦書きの送りと本の窓の外を知らない）
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (k === "f" || k === "F") && !P.ov && P.pane && !P.pane.hidden &&
      (P.layout === "book" || P.pane.contains(document.activeElement))){ stop(); openFind(); return; }
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
    if ((k === "Enter" || k === " ") && !mod && e.target && e.target.classList && e.target.classList.contains("dx-zoom")){ stop(); openFig(e.target); return; }
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
  if (P.pop) closePop(true);
  progress();
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
  // 狭いとき、ボタンの字は見えなくするが読み上げソフトには残す（名前を失わない）
  "@media (max-width:639px){#deck-ov .dx-ovbot .lab{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}}" +
  "#deck-text{container-type:inline-size}@container (max-width:600px){#deck-text .dx-head .lab{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}#deck-text .dx-head button{padding:4px 8px}}" +
  // 読むための道具（C）
  // 文字サイズ（--dx-fs。舞台・小さなスライドは窓の幅のまま）と行間。行の長さは em のまま（字が大きいと 1 行の字数が減る。横にはみ出さない）
  "#deck-text{--dx-fs:1}#deck-text #egatari-article{font-size:calc(18px*var(--dx-fs))}#deck-text .dx-script{font-size:calc(17px*var(--dx-fs))}" +
  "#deck-text .katex-display,#deck-text figure.egatari-table{overflow-x:auto;overflow-y:hidden}#deck-text .dx-vertical .katex-display,#deck-text .dx-vertical figure.egatari-table{overflow-x:visible}" +
  "#deck-text[data-dx-lh=wide] #egatari-article,#deck-text[data-dx-lh=wide] .dx-script{line-height:2.3}" +
  // 背景：本の窓だけ（小さなスライドの影の木には変数を渡さない：スライドの色は意味を持つ、Player P2）
  "#deck-text[data-dx-bg=sepia]{background:#f6eedb;color:#2b2213}#deck-text[data-dx-bg=black]{background:#000;color:#ececec}" +
  "#deck-text[data-dx-bg=sepia] :is(.dx-head,.dx-findbar,#egatari-article,.dx-stitle,.dx-step){--bg:#f6eedb;--fg:#2b2213;--muted:#62553f;--line:rgba(90,70,30,.35)}" +
  "#deck-text[data-dx-bg=black] :is(.dx-head,.dx-findbar,#egatari-article,.dx-stitle,.dx-step){--bg:#000;--fg:#ececec;--muted:#b3b3b3;--line:rgba(255,255,255,.35);--emph:#ffb454;--term:#ffd27a;--accent:#8cc8ff;--accent2:#8cc8ff}" +
  "#deck-text[data-dx-bg=black] #egatari-article a{color:#8cc8ff}#deck-text[data-dx-bg=black] figure img{background:#fff}" +
  "#deck-text[data-dx-bg=black] .dx-thumb{outline-color:rgba(255,255,255,.4)}" +
  // 進行状況の線（縦書きは右から）
  "#deck-text .dx-prog{flex:none;height:3px;background:var(--line,rgba(127,127,127,.25));overflow:hidden}#deck-text .dx-prog>span{display:block;height:100%;background:currentColor;opacity:.55;transform-origin:left;transform:scaleX(0)}" +
  "#deck-text[data-dx-v] .dx-prog>span{transform-origin:right}" +
  // 検索
  "#deck-text .dx-findbar{flex:none;display:flex;align-items:center;gap:4px;padding:4px 10px;border-bottom:1px solid var(--line,rgba(127,127,127,.35));color:var(--fg)}#deck-text .dx-findbar[hidden]{display:none}" +
  "#deck-text .dx-findbar input{flex:1;min-width:6em;box-sizing:border-box;height:32px;padding:0 8px;border:1px solid var(--line,rgba(127,127,127,.6));border-radius:6px;background:var(--bg,#fff);color:var(--fg);" + F + "}" +
  "#deck-text .dx-findbar input:focus-visible{outline:3px solid #2563eb;outline-offset:1px}#deck-text .dx-count{" + F + ";min-width:4.5em;text-align:center;font-variant-numeric:tabular-nums}" +
  "#deck-text .dx-icon .lab,#deck-resume .dx-icon .lab{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}#deck-text .dx-findbar button{padding:4px 7px}" +
  "::highlight(dx-find){background-color:#fde68a;color:#111}::highlight(dx-find-cur){background-color:#f59e0b;color:#000;text-decoration:underline 3px #000}" +
  // 目次・文字と背景の箱（並べ方の選択と同じ見た目）
  ".dx-pop{position:fixed;z-index:45;box-sizing:border-box;max-width:min(380px,calc(100vw - 12px));max-height:70vh;overflow:auto;padding:6px;border-radius:10px;background:#fff;color:#1a1a1a;box-shadow:0 8px 28px rgba(0,0,0,.3);" + F + "}" +
  ".dx-pop button{all:unset;box-sizing:border-box;cursor:pointer;" + F + "}.dx-pop button:focus-visible,.dx-pop input:focus-visible{outline:3px solid #2563eb;outline-offset:2px}" +
  "#deck-toc{min-width:240px}#deck-toc ol{list-style:none;margin:0;padding:0}#deck-toc .dx-ti{display:block;width:100%;padding:7px 10px;border-radius:6px;border-left:3px solid transparent;line-height:1.35}" +
  "#deck-toc .dx-ti:hover{background:#e8eefc}#deck-toc .dx-l0{font-weight:600}#deck-toc .dx-l1{padding-left:22px}#deck-toc .dx-here{border-left-color:#1d4ed8;background:#eef2ff;font-weight:700}" +
  "#deck-reading{width:300px}#deck-reading .dx-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0;padding:8px 6px;border:0;border-top:1px solid #e5e7eb}#deck-reading .dx-row:first-child{border-top:0}" +
  "#deck-reading .dx-legend{flex-basis:100%;padding:0;margin:0 0 2px;font-size:12px;color:#555;float:left}#deck-reading .dx-size{min-width:3.5em;text-align:center;font-variant-numeric:tabular-nums}" +
  "#deck-reading .dx-row button{display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:36px;border:1px solid #c7c7c7;border-radius:8px}#deck-reading button:disabled{opacity:.4;cursor:default}" +
  "#deck-reading .dx-a{font-family:serif;line-height:1}#deck-reading .dx-a-s{font-size:13px}#deck-reading .dx-a-l{font-size:22px}#deck-reading .dx-row button .lab{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}" +
  "#deck-reading .dx-opt{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border:1px solid #c7c7c7;border-radius:8px;cursor:pointer}#deck-reading .dx-opt:has(input:checked){border:2px solid #1d4ed8;padding:5px 9px;font-weight:600}" +
  "#deck-reading .dx-opt input{margin:0}#deck-reading .dx-bg input{position:absolute;opacity:0;width:1px;height:1px}#deck-reading .dx-bg:has(input:checked)::after{content:'✓';font-weight:700}#deck-reading .dx-opt:has(input:focus-visible){outline:3px solid #2563eb;outline-offset:2px}" +
  "#deck-reading .dx-sw{width:16px;height:16px;border-radius:4px;border:1px solid #888}.dx-sw-white{background:#fff}.dx-sw-sepia{background:#f6eedb}.dx-sw-black{background:#000}" +
  // 拡大した図（スライドで見るの重ねと同じ暗い地）
  "#deck-fig{position:fixed;inset:0;z-index:46;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center}#deck-fig .dx-figbox{outline:none;display:flex;flex-direction:column;align-items:center;gap:8px}" +
  "#deck-fig .dx-ovtop{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;min-width:min(480px,92vw);color:#fff;" + F + "}#deck-fig .dx-ovtitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  "#deck-fig button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:4px 10px;border-radius:8px;cursor:pointer;color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);" + F + "}" +
  "#deck-fig button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}#deck-fig svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round}#deck-fig .dx-figimg{background:#fff;border-radius:4px;max-width:92vw}" +
  "#deck-text img.dx-zoom{cursor:zoom-in}#deck-text img.dx-zoom:focus-visible{outline:3px solid #2563eb;outline-offset:3px}" +
  // 前回の続きから（本の窓の下。再生中の所に戻ると同じ形）
  "#deck-resume{position:fixed;bottom:18px;z-index:30;transform:translateX(-50%);display:flex;align-items:center;gap:8px;padding:6px 6px 6px 14px;border-radius:999px;color:#fff;background:rgba(20,20,20,.88);box-shadow:0 2px 12px rgba(0,0,0,.25);" + F + "}" +
  "#deck-resume button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;min-height:30px;padding:4px 12px;border-radius:999px;cursor:pointer;background:rgba(255,255,255,.16);" + F + "}#deck-resume button:focus-visible{outline:3px solid #93c5fd}" +
  "#deck-resume svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}.deck-ov-open #deck-resume,html[data-deck-layout=slides] #deck-resume{display:none}" +
  // 読み上げている話（台本で読む）
  "#deck-text .dx-step p.dx-say{background:color-mix(in srgb,var(--emph,#f59e0b) 16%,transparent);box-shadow:-6px 0 0 color-mix(in srgb,var(--emph,#f59e0b) 16%,transparent),6px 0 0 color-mix(in srgb,var(--emph,#f59e0b) 16%,transparent);border-radius:2px}" +
  "@media (forced-colors:active){#deck-text .dx-step p.dx-say{outline:2px solid Highlight}::highlight(dx-find-cur){background-color:Highlight;color:HighlightText}}" +
  "@media print{#deck-text,#deck-split,#deck-readin,#deck-backplay,#deck-ov,#deck-layouts,#deck-fig,#deck-resume,.dx-pop{display:none!important}html[data-deck-layout] #stage{clip-path:none!important}}";
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
  loadReading();
  var st = DECK.state && DECK.state();
  if (st) P.pos = {i: st.slide - 1, k: st.step};
  if (HAS_ART) articleMaps();
  html.setAttribute("data-deck-layout", "slides");
  var first = initialLayout();
  if (first !== "slides") setLayout(first, {focus: false});
  placeReadIn();
  initResume(first);
}
DECK.panes = {
  menu: function(anchor){ if (DECK.ready && T) menu(anchor); },
  // 試験と埋め込みの手前の口：並べ方を読む・替える（名前は slides・book・split か仕様の flow・pages）
  layout: function(name){ if (name && T) setLayout(SPEC_IN[name] || name, {persist: true}); return P.layout; },
  state: function(){
    return {reading: {size: P.rs.size, lh: P.rs.lh, bg: P.rs.bg}, find: P.find && !P.find.bar.hidden ? {hits: P.find.hits.length, cur: P.find.cur} : null,
      progress: P.prog ? +P.prog.getAttribute("aria-valuenow") || 0 : null, resumed: !!P.resumeN, figure: !!P.fig,
      layout: P.layout, detached: P.detached, playing: P.playing, overlay: !!P.ov, article: HAS_ART, vertical: P.vertical,
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
