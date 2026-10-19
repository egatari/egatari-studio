// デッキの iframe（sandbox、origin を持たない）の中で、実行系より前に動く小さな仲立ち。編集アプリが文書の信頼する先頭部分に入れる（app/preview-doc.js）
// cfg = {query, opener, dev, load, html, shim, prefix}
//   query   location.search にする文字列（"?presenter=1" など。srcdoc の文書は URL を持たないので history で付ける）
//   opener  発表者ビュー：window.opener を親（アプリが開いた窓）にする。本体とのやり取りはアプリが中継する
//   dev     プレビュー：印刷・位置・簡易な検査の頼みを受ける（書き込みの口はない。編集はアプリの画面で行い、デッキは知らせを送るだけ）
//   html    発表者ビュー：中の 2 つの画面（今・次）に同じデッキを srcdoc で入れるための元の HTML。shim はこの関数の文字列、
//           prefix は信頼する先頭部分（決まりの <meta> まで）。中の画面も「先頭部分 + 仲立ち + デッキ」で組む（デッキの中を探して入れない）
(function frameShim(cfg){
"use strict";
var parentWin = window.parent;
if (cfg.query) { try { history.replaceState(null, "", "about:srcdoc" + cfg.query); } catch (e) {} }
if (cfg.opener) { try { window.opener = parentWin; } catch (e) {} }
// p（発表者ビュー）は窓を開けないので、アプリに頼む
window.open = function(u){
  if (/[?&]presenter=1/.test(String(u || ""))) parentWin.postMessage({type: "app-open-presenter"}, "*");
  return null;
};
// 発表者ビューの中の画面：src="about:srcdoc?view=…" の代わりに、同じデッキを srcdoc で入れる
if (cfg.html && cfg.shim && cfg.prefix) {
  var d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
  Object.defineProperty(HTMLIFrameElement.prototype, "src", {configurable: true, get: d.get, set: function(v){
    var s = String(v);
    if (s.indexOf("about:srcdoc") !== 0) return d.set.call(this, v);
    var q = s.slice("about:srcdoc".length);
    var tag = "<script>(" + cfg.shim + ")(" + JSON.stringify({query: q}).replace(/</g, "\\u003c") + ");<\/script>";
    this.srcdoc = cfg.prefix + tag + cfg.html;
  }});
}
if (!cfg.dev) return;
window.__APP_LOAD = cfg.load;   // 何回目の読み込みか（確かめ方が使う）
// デッキのスクリプトのエラー（コンソールのエラーと捕まらなかった例外）を簡易チェックに出す。言葉だけ（スタックは持たない。場所は app/llm.js が除く）
var jsErrors = [];
var noteError = function(t){ t = String(t || "").split("\n")[0].slice(0, 300); if (t && jsErrors.indexOf(t) < 0 && jsErrors.length < 20) jsErrors.push(t); };
window.addEventListener("error", function(e){ noteError((e.error && e.error.name ? e.error.name + ": " : "") + (e.message || "")); });
window.addEventListener("unhandledrejection", function(e){ noteError(e.reason && e.reason.message || e.reason); });
var cerr = console.error;
console.error = function(){
  noteError([].map.call(arguments, function(x){ return x && x.message !== undefined ? (x.name ? x.name + ": " : "") + x.message : String(x); }).join(" "));
  return cerr.apply(console, arguments);
};

// 親（編集アプリ）からの、書き込みのない頼みごと：印刷・その位置へ・簡易な検査。編集の知らせは server/hints.js が送る
window.addEventListener("message", function(e){
  if (e.source !== parentWin) return;
  var m = e.data || {};
  if (m.type === "app-print") window.print();
  else if (m.type === "app-go" && window.DECK) window.DECK.go(m.i, m.k, false);
  else if (m.type === "app-check") whenReady(function(){ parentWin.postMessage({type: "app-check-result", id: m.id, load: cfg.load, results: quickCheck()}, "*"); });
});
// 簡易な検査は、実行系が組み上がってから（DECK.ready）。頼みが先に届いても待つ（空の結果を「エラー 0」として返さない）。
// 10 秒たっても組み上がらなければ、そのまま検査する（実行系が止まったデッキ：スクリプトのエラーを返す）
function whenReady(fn){
  if (window.DECK && window.DECK.ready) return fn();
  var done = false, go = function(){ if (!done) { done = true; fn(); } };
  document.addEventListener("deck:ready", go);
  setTimeout(go, 10000);
}

// ---------------------------------------------------------------- 簡易な検査（kit/check.mjs の一部：はみ出し・文字の大きさ・字数・口述原稿・コントラスト）
// 部品の再現性・タイムライン・モーフ・読み上げの検査はしない（全部の検査は CLI の npm run check）
function quickCheck(){
  var DECK = window.DECK;
  if (!DECK || !DECK.slides) return jsErrors.map(function(t){ return {i: null, title: "", sev: "error", code: "consoleError", arg: t}; });
  var JA = DECK.ja !== false, S = DECK.slides, out = [];
  var st = DECK.state(), back = {i: st.slide - 1, k: st.step};
  var units = function(s){ return Array.from(s).reduce(function(a, ch){ return a + (/[\u0000-ÿ]/.test(ch) ? 0.5 : 1); }, 0); };
  var vis = function(el){ if (!el) return ""; var c = el.cloneNode(true); c.querySelectorAll(".katex-mathml").forEach(function(x){ x.remove(); }); return c.textContent; };
  var add = function(i, sev, code, arg){ out.push({i: i, title: i === null ? "" : ((S[i].querySelector("h2, h1") || {}).textContent || S[i]._key).replace(/\s+/g, " ").trim(), sev: sev, code: code, arg: arg}); };
  S.forEach(function(s, i){
    DECK.seek(i, s._max, Infinity);
    var sr = s.getBoundingClientRect(), k = sr.width / 1280 || 1;
    var h2 = s.querySelector("h2"), c = s.querySelector(".concl"), body = s.querySelector(".body");
    if (h2) {
      var t = vis(h2).trim();
      if (JA && units(t) > 26) add(i, "error", "titleLong", units(t));
      if (!JA && t.length > 60) add(i, "warn", "titleLongEn", t.length);
    }
    if (c) {
      var ct = vis(c).trim();
      if (JA && units(ct) > 35) add(i, "error", "conclLong", units(ct));
      if (!JA && ct.length > 70) add(i, "warn", "conclLongEn", ct.length);
      if (c.scrollWidth > c.clientWidth + 1) add(i, "error", "conclOverflow");
    }
    if (body) {
      var lim = s.classList.contains("noconcl") ? 680 : 565, maxB = 0, maxR = 0;
      body.querySelectorAll("*").forEach(function(el){
        if (el.closest("svg") && el.tagName !== "svg") return;
        if (el.closest(".katex") && !el.classList.contains("katex")) return;
        var r = el.getBoundingClientRect();
        if (!r.width && !r.height) return;
        maxB = Math.max(maxB, (r.bottom - sr.top) / k); maxR = Math.max(maxR, (r.right - sr.left) / k);
      });
      if (maxB > lim) add(i, "error", "overflowBottom", Math.round(maxB) + " > " + lim);
      if (maxR > 1236) add(i, "error", "overflowRight", Math.round(maxR));
      if (!/文献|References/.test(h2 ? h2.textContent : "")) {
        var tw = document.createTreeWalker(body, NodeFilter.SHOW_TEXT), n;
        while ((n = tw.nextNode())) {
          if (!n.textContent.trim()) continue;
          var e = n.parentElement;
          if (e.closest("svg") || e.closest(".katex") || e.closest(".cite") || e.closest(".pn") || e.closest(".figcap") || e.closest("rt")) continue; // ルビ（rt）は本文の半分の大きさが決まり（kit/check.mjs と同じ）
          var f = parseFloat(getComputedStyle(e).fontSize), lim2 = e.closest("table,.plot") ? 23.9 : 26.6;
          if (f < lim2) { add(i, "error", "smallText", f + "px「" + n.textContent.trim().slice(0, 12) + "」"); break; }
        }
      }
      if (body.querySelector(".katex-error")) add(i, "error", "katexError");
    }
    // 口述原稿：段階ごと（static のスライドは段階 0 だけ）。スライドにない段階の口述原稿（[k] が段階を超える・結論のない [concl]）はエラー
    var valid = {}, isStatic = s.classList.contains("static");
    for (var kk = 0; kk <= (isStatic ? 0 : s._max); kk++) {
      var full = DECK.stepKey(i, kk), sk = full.slice(s._key.length + 1);
      valid[sk] = true;
      var turns = (DECK.NARRATION[s._key] || {})[sk] || [];
      if (!turns.length) add(i, "warn", "noNarration", sk);
    }
    // 段階は DOM からも数える（部品が描けなくても data-step と .concl は数える。kit/check.mjs と同じ）
    var dmax = 0;
    s.querySelectorAll("[data-step]:not([data-concl])").forEach(function(e){ var n = +e.getAttribute("data-step"); if (n === Math.floor(n) && n >= 0) dmax = Math.max(dmax, n); });
    var hasC = !isStatic && (s._cstep >= 0 || !!s.querySelector(".concl"));
    var num = Math.max(isFinite(s._max) ? (s._cstep >= 0 ? s._max - 1 : s._max) : 0, dmax);
    var smax = isStatic ? 0 : num + (hasC ? 1 : 0), keys = [];
    for (var q = 0; q <= num && !isStatic; q++) { keys.push(String(q)); valid[String(q)] = true; }
    if (isStatic) keys.push("0");
    if (hasC) { keys.push("concl"); valid.concl = true; }
    var bad = (DECK.componentErrors || []).filter(function(r){ return r.slide === i; }).map(function(r){ return r.tag; });
    Object.keys(DECK.NARRATION[s._key] || {}).forEach(function(sk){ if (!valid[sk]) add(i, "error", "orphanNarration", {step: sk, max: smax, cstep: hasC ? smax : -1, static: isStatic, keys: keys, comps: bad}); });
  });
  // 部品のデータの形（kit/deck.js の DECK.componentErrors）と、スクリプトのエラー
  (DECK.componentErrors || []).forEach(function(r){ add(r.slide, "error", "compData", JSON.parse(JSON.stringify(r))); });
  var compTags = (DECK.componentErrors || []).map(function(r){ return r.tag; });
  jsErrors.forEach(function(t){ if (!compTags.some(function(g){ return t.toLowerCase().indexOf(g + " ") === 0; })) add(null, "error", "consoleError", t); });
  // コントラスト（WCAG）：canvas に塗って実際の色を読む
  try {
    var probe = document.createElement("div"); probe.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
    document.body.appendChild(probe);
    var cv = document.createElement("canvas"); cv.width = cv.height = 1; var ctx = cv.getContext("2d");
    var rgb = function(v){ probe.style.color = "var(" + v + ")"; ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = getComputedStyle(probe).color; ctx.fillRect(0, 0, 1, 1); var d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
    var lum = function(c){ var f = function(x){ x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    var ratio = function(a, b){ var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    var bg = rgb("--bg");
    ["--fg", "--term", "--emph", "--title", "--accent2"].forEach(function(v){ var r = ratio(rgb(v), bg); if (r < 4.5) add(null, "error", "contrast", v + " " + r.toFixed(2) + ":1 < 4.5:1"); });
    var rm = ratio(rgb("--muted"), bg); if (rm < 3) add(null, "warn", "contrast", "--muted " + rm.toFixed(2) + ":1 < 3:1");
    probe.remove();
  } catch (e) {}
  DECK.go(back.i, back.k, false);
  return out;
}
})
