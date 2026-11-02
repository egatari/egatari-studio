// 本の枠（app/book.js の #book-view。sandbox の srcdoc）の中の信頼する仲立ち。読むための頁（kit/core/article-page.mjs）はスクリプトを持たないので、
// 編集アプリが文書の信頼する先頭部分に入れる（app/preview-doc.js の previewDocument。script の閉じタグとコメントの始まりの字を書かないこと）。
// 本を印刷するための見えない枠（app/book.js の print）で動く。
// 印刷の頼み（slides：スライドの鍵と id → 番号、words：{slide, step, concl}。教材の言葉で「→ スライド {n}」「→ スライド {n}・ステップ {k}」）で、
// ステップへのリンクの後ろにそれを足して印刷し（A4 縦。format spec §9C.13：ステップ 0 へのリンクはスライドだけ）、終われば外す
(function(){
var P = window.parent;
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
  var done = function(){ added.forEach(function(s){ s.remove(); }); css.remove(); window.removeEventListener("afterprint", done); if (!m.dry) P.postMessage({type: "book-printed"}, "*"); };
  window.addEventListener("afterprint", done);
  // dry（試験）：印刷の窓を開かず、刷る字と用紙の決まりを親に返す
  if (m.dry) { P.postMessage({type: "book-printed", texts: added.map(function(s){ return s.textContent; }), a4: /size:A4 portrait/.test(css.textContent)}, "*"); done(); return; }
  window.print();
});
})();
