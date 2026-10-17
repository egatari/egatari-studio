// プレビューの中（デッキの文書）で動く小さな部品。開発サーバー（server/dev.mjs）と編集アプリ（app/）が </body> の前に入れる
// ここは「指さすだけ」：どの要素を直したいか・どの段階の口述原稿を開きたいか・どこにコメントしたいかを親の画面（信頼する編集の画面、
// server/editor-ui.js）に知らせる（hint）。書き込む本文も合言葉も持たず、ここから原稿を書き換える手段はない。
// 読む・確かめる・見せる・保存するのは親の画面で、保存は親の画面のボタン（⌘/Ctrl+Enter）を押したときだけ
//
// デッキ → 親：{type: "edit-hint", kind, …}
//   ready                           実行系の準備ができた（親は位置を戻し、編集モードの状態を送り返す）
//   key      {key}                  e・n・c・Escape が押された（入力中でないとき）
//   edit     {src, h, tag, rect}     編集モードでダブルクリックした要素（data-src の範囲と data-src-h）
//   comment  {key, src, quote, rect} Alt/⌥+クリックした所（段階の鍵・要素の範囲・80 字までの引用）
//   位置は実行系の deck-pos（kit/deck.js）をそのまま使う
// 親 → デッキ：
//   {type: "edit-state", edit, target}  編集モードの枠を出す・消す、target の要素（data-src の範囲か "#comment"）に印
//   {type: "edit-go-key", key}          その段階へ移る（コメントの一覧から）
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
  "#stage .dev-target{outline:2px solid #f59e0b!important;outline-offset:3px}"
].join("\n");
var st = document.createElement("style"); st.className = "edit-ui"; st.textContent = css; (document.head || document.documentElement).appendChild(st);

function stage(){ return document.getElementById("stage"); }
function inStage(el){ var s = stage(); return !!(s && el && s.contains(el)); }
function rectOf(r){ return {l: r.left, t: r.top, r: r.right, b: r.bottom}; }
function typing(e){ var t = e.target; return t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName)); }

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
    editOn = !!m.edit;
    document.documentElement.classList.toggle("dev-edit", editOn);
    if (!editOn && hoverEl){ hoverEl.classList.remove("dev-hover"); hoverEl = null; }
    setTarget(m.target);
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
document.addEventListener("click", function(e){
  if (!e.altKey || !inStage(e.target) || !window.DECK) return;
  e.preventDefault(); e.stopPropagation();
  var target = e.target;
  var el = target.closest("[data-src]") || target.closest("[data-step], m-sweep, svg, .concl, .body, .slide") || target;
  lastComment = el;
  send({kind: "comment", key: window.DECK.state().key, src: el.getAttribute("data-src") || null,
    quote: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
    rect: {l: e.clientX - 20, t: e.clientY - 8, r: e.clientX, b: e.clientY + 8}});
}, true);
document.addEventListener("keydown", function(e){
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "e" || e.key === "n" || e.key === "c" || e.key === "Escape") send({kind: "key", key: e.key});
});
function ready(){ send({kind: "ready"}); }
if (window.DECK && window.DECK.ready) ready(); else document.addEventListener("deck:ready", ready);
})();
