// プレビューの中（デッキの文書）で動く小さな部品。開発サーバー（server/dev.mjs）と編集アプリ（app/）が </body> の前に入れる
// ここは「指さすだけ」：どの要素を直したいか・どの段階の口述原稿を開きたいか・どこにコメントしたいかを親の画面（信頼する編集の画面、
// server/editor-ui.js）に知らせる（hint）。書き込む本文も合言葉も持たず、ここから原稿を書き換える手段はない。
// 読む・確かめる・見せる・保存するのは親の画面で、保存は親の画面のボタン（⌘/Ctrl+Enter）を押したときだけ
//
// デッキ → 親：{type: "edit-hint", kind, …}
//   ready                           実行系の準備ができた（親は位置を戻し、編集モードの状態を送り返す）
//   key      {key}                  e・n・c・Escape が押された（入力中でないとき）
//   tool     {mode}                 発表の道具が変わった（"laser"・"pen"・"vpen"、編集中の手書きメモ "ink" か null。kit/tools.js の deck:tool。親は画面の端に今のモードを出す）
//   edit     {src, h, tag, rect}     編集モードでダブルクリックした要素（data-src の範囲と data-src-h）
//   comment  {key, src, quote, near, pin, rect} Alt/⌥+クリックした所（段階の鍵・要素の範囲・80 字までの引用、
//            near：押した所の近くの字（部品の中の札・語など。60 字まで）、pin：押した点のスライドの座標 {x, y}（1280×720、表示の倍率によらない））
//            段階の途中（動いている間）に押しても、点は鍵の段階の最後の状態（DECK.seek(i, k, Infinity)）を指すものとして残す
//   comment  {…, stroke}            手書きメモ（編集中の道具 ink、m）で描き終えた線（kit/tools.js の deck:ink）。stroke は線の点 [[x, y], …]（スライドの座標）。
//            pin は線の重心（長さで重みを付けた区間の中点の平均）、key・src・quote・near は Alt+クリックと同じく、重心の下の要素から
//            （重心が舞台の外・描く面の外なら 1 点目の下）。線を丸め・間引き・確かめるのは親の画面と書き込む側（kit/core/comment-core.mjs の normStroke）
//   位置は実行系の deck-pos（kit/deck.js）をそのまま使う
// 親 → デッキ：
//   {type: "edit-state", edit, target}  編集モードの枠を出す・消す、target の要素（data-src の範囲か "#comment"）に印。
//                                       編集モードが変わったら document に deck:edit {on} を送る（kit/deck.js・kit/tools.js が発表の道具と自動再生・暗転・一覧などを切る）
//   {type: "edit-go-key", key}          その段階へ移る（コメントの一覧から）
//   {type: "edit-ink", on}              手書きメモの道具（kit/tools.js の ink）を出す・切る（編集モードの間だけ）
// 部品はすべて class="edit-ui"（印刷では base.css が隠す）
(function(){
"use strict";
var Q = new URLSearchParams(location.search);
if (window.parent === window) return;            // 親の画面がない（直接開いた）：知らせる相手がいない
var P = window.parent;
// 発表者ビュー（p）：sandbox の中では窓を開けないので、親に頼む。発表者ビューの文書は親（中継役）を opener にする
window.open = function(u){
  if (/[?&]presenter=1/.test(String(u || ""))) P.postMessage({type: "app-open-presenter"}, "*");
  return null;
};
if (Q.get("presenter")) { try { if (!window.opener) window.opener = P; } catch (e) {} }
if (Q.get("view") || Q.get("presenter")) return;
window.DECK_DEV = true;                           // kit/tools.js のキーの一覧に e・n・c を載せる
function send(m){ m.type = "edit-hint"; try { P.postMessage(m, "*"); } catch (e) {} }

var css = [
  "html.dev-edit #stage .slide.active [data-src]{outline:1px dashed rgba(37,99,235,.28);outline-offset:2px}",
  "html.dev-edit #stage [data-src].dev-hover{outline:2px solid #2563eb!important;outline-offset:3px;background:rgba(37,99,235,.06);cursor:text}",
  "#stage .dev-target{outline:2px solid #f59e0b!important;outline-offset:3px}",
  "html.dev-edit #dt-layer:not(.ink){pointer-events:none!important}"
].join("\n");
var st = document.createElement("style"); st.className = "edit-ui"; st.textContent = css; (document.head || document.documentElement).appendChild(st);

function stage(){ return document.getElementById("stage"); }
function inStage(el){ var s = stage(); return !!(s && el && s.contains(el)); }
function rectOf(r){ return {l: r.left, t: r.top, r: r.right, b: r.bottom}; }
function clip(v, n){ v = String(v || "").replace(/\s+/g, " ").trim(); return v.length > n ? v.slice(0, n - 1) + "…" : v; }
// 押した点をスライドの座標（1280×720）にする：#stage の見えている四角から測る（表示の倍率・窓の大きさによらない）
function slidePoint(e){
  var s = stage(); if (!s) return null;
  var r = s.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return null;
  return {x: Math.round((e.clientX - r.left) * 12800 / r.width) / 10, y: Math.round((e.clientY - r.top) * 7200 / r.height) / 10};
}
// 押した所の近くの字（部品の中の札・語・図の中の文字）。影の木（shadow DOM）の中も composedPath で辿る。60 字まで
function ownText(n){
  for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 3 && /\S/.test(c.nodeValue)) return true;
  return false;
}
function up(n){ return n.parentNode && n.parentNode.nodeType === 11 ? n.parentNode.host : n.parentElement; }
function nearText(e, el){
  var path = e.composedPath ? e.composedPath() : [e.target], deep = path[0];
  if (!deep || deep.nodeType !== 1) deep = e.target;
  // 1. 押した要素から el まで：短い名前（aria-label）か、短い字を持つもの
  for (var n = deep, i = 0; n && i < 12; n = up(n), i++){
    var lab = n.getAttribute && n.getAttribute("aria-label");
    if (lab && /\S/.test(lab) && clip(lab, 400).length <= 60) return clip(lab, 60);   // 長い名前（段落全体の読み上げなど）は点の手がかりにならない
    if (n !== el){ var t = clip(n.textContent, 400); if (t && t.length <= 60) return t; }
    if (n === el) break;
  }
  // 2. 長い字の中を押した：その点の前後の字（影の木の外だけ）
  var root = deep.getRootNode ? deep.getRootNode() : document;
  if (root === document && document.caretRangeFromPoint){
    var cr = document.caretRangeFromPoint(e.clientX, e.clientY), tn = cr && cr.startContainer;
    // 字の上を押したときだけ（字のない所では、いちばん近い字に寄せられてしまう）
    var on = false;
    if (tn && tn.nodeType === 3 && deep.contains(tn) && tn.nodeValue.length){
      var q = document.createRange(), at = Math.min(cr.startOffset, tn.nodeValue.length - 1);
      q.setStart(tn, at); q.setEnd(tn, at + 1);
      var cb = q.getBoundingClientRect(), pad = Math.max(cb.width, cb.height) * 0.75;
      on = cb.width + cb.height > 0 && e.clientX >= cb.left - pad && e.clientX <= cb.right + pad && e.clientY >= cb.top - pad && e.clientY <= cb.bottom + pad;
    }
    if (on){
      var v = tn.nodeValue, o = cr.startOffset, a = Math.max(0, o - 24), b = Math.min(v.length, o + 24);
      var w = clip(v.slice(a, b), 60);
      if (w) return (a > 0 ? "…" : "") + w + (b < v.length ? "…" : "");
    }
  }
  // 3. 字のない所（図の線・面）：点にいちばん近い字（160px まで）。まず図（svg）の中の字（札）から探し、なければ同じ木（影の木か el）の中から
  function dist(x){
    var r = x.getBoundingClientRect(); if (!r.width && !r.height) return Infinity;
    var dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right), dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
    return dx * dx + dy * dy;
  }
  function nearest(scope){
    var best = null, bd = 160 * 160, all = scope.querySelectorAll("*");
    for (var j = 0; j < all.length && j < 3000; j++){
      var x = all[j]; if (!ownText(x)) continue;
      var d = dist(x); if (d < bd){ bd = d; best = x; }
    }
    return best;
  }
  var scope = root !== document && root.querySelectorAll ? root : el, best = null;
  [].some.call(scope.querySelectorAll("svg"), function(g){ var x = nearest(g); if (x && (!best || dist(x) < dist(best))) best = x; return false; });
  if (!best) best = nearest(scope);
  return best ? clip(best.textContent, 60) : "";
}
// 入力中か（影の木の中の欄も composedPath の先頭で見る）
function typing(e){
  var t = e.composedPath ? e.composedPath()[0] : e.target;
  if (!t || t.nodeType !== 1) t = e.target;
  return !!(t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));
}

var editOn = false, hoverEl = null, lastComment = null;
function setTarget(t){
  [].forEach.call(document.querySelectorAll(".dev-target"), function(x){ x.classList.remove("dev-target"); });
  var el = null;
  if (t === "#comment") el = lastComment;
  else if (typeof t === "string" && /^\d+-\d+$/.test(t)) el = document.querySelector('#stage [data-src="' + t + '"]');
  if (el) el.classList.add("dev-target");
}
function posOfKey(key){
  var D = window.DECK; if (!D || !D.slides) return null;
  var p = key.lastIndexOf(":"), sk = key.slice(0, p), stp = key.slice(p + 1);
  var i = D.slides.findIndex(function(s){ return s._key === sk; });
  if (i < 0) return null;
  var s = D.slides[i];
  return {i: i, k: stp === "concl" ? (s._cstep >= 0 ? s._cstep : s._max) : Math.min(+stp || 0, s._max)};
}
window.addEventListener("message", function(e){
  if (e.source !== P) return;
  var m = e.data || {};
  if (m.type === "edit-state"){
    var was = editOn;
    editOn = !!m.edit;
    document.documentElement.classList.toggle("dev-edit", editOn);
    if (editOn !== was) document.dispatchEvent(new CustomEvent("deck:edit", {detail: {on: editOn}}));
    if (!editOn && hoverEl){ hoverEl.classList.remove("dev-hover"); hoverEl = null; }
    setTarget(m.target);
  } else if (m.type === "edit-ink"){
    var T = window.DECK && window.DECK.tools;
    if (T && editOn) T.setMode(m.on ? "ink" : null);
  } else if (m.type === "edit-go-key" && typeof m.key === "string"){
    var p = posOfKey(m.key);
    if (p && window.DECK) window.DECK.go(p.i, p.k, false);
  }
});
document.addEventListener("mouseover", function(e){
  if (!editOn) return;
  var t = e.target && e.target.closest ? e.target.closest("[data-src]") : null;
  if (t && !inStage(t)) t = null;
  if (t === hoverEl) return;
  if (hoverEl) hoverEl.classList.remove("dev-hover");
  hoverEl = t;
  if (t) t.classList.add("dev-hover");
});
document.addEventListener("dblclick", function(e){
  if (!editOn) return;
  var t = e.target && e.target.closest ? e.target.closest("[data-src]") : null;
  if (!t || !inStage(t)) return;
  e.preventDefault();
  var sel = window.getSelection && window.getSelection(); if (sel) sel.removeAllRanges();
  send({kind: "edit", src: t.getAttribute("data-src"), h: t.getAttribute("data-src-h"), tag: t.tagName.toLowerCase(), rect: rectOf(t.getBoundingClientRect())});
});
// 押した（または線の重心の）要素から、コメントの知らせ（段階の鍵・要素の範囲・引用・近くの字）を作る。e は clientX・clientY・composedPath を持つもの
function commentHint(e, target){
  var el = target.closest("[data-src]") || target.closest("[data-step], m-sweep, svg, .concl, .body, .slide") || target;
  lastComment = el;
  var full = (el.textContent || "").replace(/\s+/g, " ").trim(), quote = full.slice(0, 80), near = "";
  try { near = nearText(e, el); } catch (err) { near = ""; }
  // 要素の字が引用に収まり、近くの字もその中にあるなら、付けても手がかりは増えない
  if (full.length <= 80 && quote.indexOf(near.replace(/^…|…$/g, "")) >= 0) near = "";
  return {kind: "comment", key: window.DECK.state().key, src: el.getAttribute("data-src") || null,
    quote: quote, near: near && near !== quote ? near : "", pin: slidePoint(e),
    rect: {l: e.clientX - 20, t: e.clientY - 8, r: e.clientX, b: e.clientY + 8}};
}
document.addEventListener("click", function(e){
  if (!e.altKey || !inStage(e.target) || !window.DECK) return;
  e.preventDefault(); e.stopPropagation();
  send(commentHint(e, e.target));
}, true);
// 手書きメモ：線の重心（なければ 1 点目）の下の要素を、描く面（#dt-layer）を除いて探す。影の木（shadow DOM）の中へも降りる
function centroid(P){
  var sx = 0, sy = 0, sl = 0;
  for (var i = 1; i < P.length; i++){
    var l = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    sx += l * (P[i][0] + P[i - 1][0]) / 2; sy += l * (P[i][1] + P[i - 1][1]) / 2; sl += l;
  }
  return sl > 0 ? [sx / sl, sy / sl] : P[0];
}
function pointAt(sx, sy){
  var s = stage(); if (!s) return null;
  var r = s.getBoundingClientRect(), cx = r.left + sx * r.width / 1280, cy = r.top + sy * r.height / 720;
  var skip = function(x){ return x.id === "dt-layer" || (x.closest && x.closest("#dt-layer, .deck-tools, .edit-ui")); };
  var hit = [].filter.call(document.elementsFromPoint(cx, cy), function(x){ return !skip(x); })[0];
  if (!hit || !inStage(hit)) return null;
  // 影の木の中の、いちばん奥の要素（nearText が composedPath で辿る）
  var deep = hit;
  for (var n = 0; deep.shadowRoot && n < 8; n++){
    var inner = [].filter.call(deep.shadowRoot.elementsFromPoint(cx, cy), function(x){ return x !== deep && !skip(x); })[0];
    if (!inner || inner === deep) break;
    deep = inner;
  }
  var path = []; for (var p = deep; p; p = up(p)) path.push(p);
  return {target: hit, ev: {clientX: cx, clientY: cy, target: hit, composedPath: function(){ return path; }}};
}
document.addEventListener("deck:ink", function(e){
  var P = e.detail && e.detail.pts;
  if (!editOn || !window.DECK || !Array.isArray(P) || P.length < 2) return;
  var c = centroid(P), at = pointAt(c[0], c[1]) || pointAt(P[0][0], P[0][1]);
  if (!at) return;
  var m = commentHint(at.ev, at.target);
  m.pin = {x: Math.round(c[0] * 10) / 10, y: Math.round(c[1] * 10) / 10};
  m.stroke = P;
  send(m);
});
document.addEventListener("keydown", function(e){
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "e" || e.key === "n" || e.key === "c" || e.key === "r" || e.key === "Escape") send({kind: "key", key: e.key});
});
document.addEventListener("deck:tool", function(e){ send({kind: "tool", mode: e.detail ? e.detail.mode : null}); });
function ready(){
  send({kind: "ready"});
  var T = window.DECK && window.DECK.tools;
  send({kind: "tool", mode: T && T.mode ? T.mode() : null});
}
if (window.DECK && window.DECK.ready) ready(); else document.addEventListener("deck:ready", ready);
})();
