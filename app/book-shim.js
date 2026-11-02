// 本の枠（app/book.js の #book-view。sandbox の srcdoc）の中の信頼する仲立ち。読むための頁（kit/core/article-page.mjs）はスクリプトを持たないので、
// 編集アプリが文書の信頼する先頭部分に入れる（app/preview-doc.js の previewDocument。script の閉じタグとコメントの始まりの字を書かないこと）。
// ステップへのリンクを押すと、親にそのステップを知らせる（スライドの表示にしてそのステップへ）。
// 印刷の頼み（slides：スライドの鍵と id → 番号、words：{slide, step, concl}。教材の言葉で「→ スライド {n}」「→ スライド {n}・ステップ {k}」）で、
// ステップへのリンクの後ろにそれを足して印刷し（A4 縦。format spec §9C.13：ステップ 0 へのリンクはスライドだけ）、終われば外す
(function(){
var P = window.parent;
document.addEventListener("click", function(e){
  var a = e.target && e.target.closest && e.target.closest("a[data-egatari-step]");
  if (!a) return;
  e.preventDefault();
  P.postMessage({type: "book-step", step: a.getAttribute("data-egatari-step")}, "*");
});
window.addEventListener("message", function(e){
  if (e.source !== P) return;
  var m = e.data || {};
  if (m.type !== "book-print") return;
  var css = document.createElement("style");
  css.textContent = "@media print{@page{size:A4 portrait;margin:18mm}body{background:#fff!important}#egatari-article{max-width:none;padding:0;font-size:10.5pt}#egatari-article a{color:inherit;text-decoration:none}}@media screen{.egatari-print-to{display:none}}";
  document.head.appendChild(css);
  var added = [];
  [].forEach.call(document.querySelectorAll("a[data-egatari-step]"), function(a){
    var t = String(a.getAttribute("data-egatari-step") || ""), i = t.lastIndexOf(":"), key = t.slice(0, i), k = t.slice(i + 1), n = (m.slides || {})[key];
    var W = m.words || {};
    if (!n || i < 1) return;
    var s = document.createElement("span");
    s.className = "egatari-print-to";
    s.textContent = " " + String(k === "0" ? W.slide : k === "concl" ? W.concl : W.step).replace("{n}", n).replace("{k}", k);
    a.after(s); added.push(s);
  });
  var done = function(){ added.forEach(function(s){ s.remove(); }); css.remove(); window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  window.__BOOK_PRINTED = (window.__BOOK_PRINTED || 0) + 1;
  window.print();
});
})();
