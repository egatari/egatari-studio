// デッキの iframe（sandbox、origin を持たない）の中で、実行系より前に動く小さな仲立ち。編集アプリが文書の信頼する先頭部分に入れる（app/preview-doc.js）
// cfg = {query, opener, dev, load, html, shim, prefix, theme}
//   query   location.search にする文字列（"?presenter=1" など。srcdoc の文書は URL を持たないので history で付ける）
//   opener  発表者ビュー：window.opener を親（アプリが開いた窓）にする。本体とのやり取りはアプリが中継する
//   dev     プレビュー：印刷・位置・品質チェックの頼みを受ける（書き込みの口はない。編集はアプリの画面で行い、デッキは知らせを送るだけ）
//   html    発表者ビュー：中の 2 つの画面（今・次）に同じデッキを srcdoc で入れるための元の HTML。shim はこの関数の文字列、
//           prefix は信頼する先頭部分（決まりの <meta> まで）。中の画面も「先頭部分 + 仲立ち + デッキ」で組む（デッキの中を探して入れない）
//   theme   プレビュー：組み立てが返したテーマ {name, metrics, declared}（kit/core/theme-metrics.mjs）。品質チェックの本文の場所の限りと、寸法のずれ（themeMetricsDrift）に使う。
//           なければ既定の寸法（今までと同じ限り）
// layoutScan・metricsProbe・LAYOUT_CLIP・LAYOUT_ANNOT：体裁の検査の関数・テーマの寸法と描いた箱を比べる関数と、わざと切る印・小さい注記の印の名前（kit/core/layout-scan.mjs）。
// app/main.js が withLayoutScan でこの文字列を包んで渡す
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
// デッキのスクリプトのエラー（コンソールのエラーと捕まらなかった例外）を品質チェックに出す。言葉だけ（スタックは持たない。場所は app/llm.js が除く）
var jsErrors = [];
var noteError = function(t){ t = String(t || "").split("\n")[0].slice(0, 300); if (t && jsErrors.indexOf(t) < 0 && jsErrors.length < 20) jsErrors.push(t); };
window.addEventListener("error", function(e){ noteError((e.error && e.error.name ? e.error.name + ": " : "") + (e.message || "")); });
window.addEventListener("unhandledrejection", function(e){ noteError(e.reason && e.reason.message || e.reason); });
var cerr = console.error;
console.error = function(){
  noteError([].map.call(arguments, function(x){ return x && x.message !== undefined ? (x.name ? x.name + ": " : "") + x.message : String(x); }).join(" "));
  return cerr.apply(console, arguments);
};

// 親（編集アプリ）からの、書き込みのない頼みごと：印刷・その位置へ・品質チェック。編集の知らせは server/hints.js が送る
window.addEventListener("message", function(e){
  if (e.source !== parentWin) return;
  var m = e.data || {};
  if (m.type === "app-print") window.print();
  else if (m.type === "app-go" && window.DECK) window.DECK.go(m.i, m.k, false);
  else if (m.type === "app-check") whenReady(function(){ parentWin.postMessage({type: "app-check-result", id: m.id, load: cfg.load, results: quickCheck()}, "*"); });
  else if (m.type === "app-audio") whenReady(function(){ previewAudio(m.items); });
});
// 品質チェックは、実行系が組み上がってから（DECK.ready）。頼みが先に届いても待つ（空の結果を「エラー 0」として返さない）。
// 10 秒たっても組み上がらなければ、そのまま検査する（実行系が止まったデッキ：スクリプトのエラーを返す）
function whenReady(fn){
  if (window.DECK && window.DECK.ready) return fn();
  var done = false, go = function(){ if (!done) { done = true; fn(); } };
  document.addEventListener("deck:ready", go);
  setTimeout(go, 10000);
}

// プレビューの音声（backlog #49）：組み立ては deck-audio の src を置き場所の印（egatari-preview:…）にし、編集アプリが読み込みの後で
// その音声のバイトを送る。この文書の blob: にして DECK.AUDIO の src を替える（sandbox の枠は親の blob: も相対のパスも読めない。
// 決まりの media-src は data: blob: だけ）。この文書の blob: は読み込み直す（文書を捨てる）と消える。同じ文書で送り直されたら前のものを消す
var audioUrls = [], audioPh = Object.create(null);   // audioPh：段階の鍵 → 組み立てが置いた印
function previewAudio(items){
  var A = window.DECK && window.DECK.AUDIO;
  if (!A || !Array.isArray(items)) return;
  audioUrls.forEach(function(u){ URL.revokeObjectURL(u); }); audioUrls = [];
  var map = {};
  items.forEach(function(it){
    if (!it || typeof it.src !== "string" || !/^egatari-preview:[0-9.]+$/.test(it.src) || !(it.bytes instanceof ArrayBuffer)) return;
    var mime = /^audio\/[a-z0-9.+-]+$/.test(it.mime || "") ? it.mime : "";
    var u = URL.createObjectURL(new Blob([it.bytes], mime ? {type: mime} : {}));
    audioUrls.push(u); map[it.src] = u;
  });
  for (var k in A) {
    if (!A[k]) continue;
    if (!(k in audioPh)) audioPh[k] = typeof A[k].src === "string" && A[k].src.indexOf("egatari-preview:") === 0 ? A[k].src : null;
    if (audioPh[k] && map[audioPh[k]]) A[k].src = map[audioPh[k]];
  }
}

// ---------------------------------------------------------------- 品質チェック（kit/check.mjs の一部：はみ出し・切れ・文字の大きさ・字数・口述原稿・コントラスト）
// はみ出し・切れ・文字の大きさ・字数は kit/core/layout-scan.mjs（コマンド版と同じ）。縦組みの限り・結論の行の高さ・図の中の字の大きさ・
// 箱で切れる字・スライドの外に出る図の字・図の箱からはみ出す字・本文の外の字も見る（backlog #51・#52）
// 部品の再現性・タイムライン・モーフ・読み上げ・です・ます・句読点の検査はしない（全部の検査は CLI の npm run check）
// コマンド版の code → ブラウザ版の前からの code（app/i18n.js の checkMsg と kit/core/llm-fix.mjs の BY_CODE が知っているもの）
var LEGACY = {titleLong: "titleLong", titleLongEn: "titleLongEn", conclLong: "conclLong", conclLongEn: "conclLongEn", conclOverflow: "conclOverflow", bodyBottom: "overflowBottom", bodyRight: "overflowRight", smallText: "smallText"};
function quickCheck(){
  var DECK = window.DECK;
  if (!DECK || !DECK.slides) return jsErrors.map(function(t){ return {i: null, title: "", sev: "error", code: "consoleError", arg: t}; });
  var JA = DECK.ja !== false, S = DECK.slides, out = [];
  var TH = cfg.theme || null, METRICS = TH && TH.metrics || null;
  var st = DECK.state(), back = {i: st.slide - 1, k: st.step};
  var add = function(i, sev, code, arg){ out.push({i: i, title: i === null ? "" : ((S[i].querySelector("h2, h1") || {}).textContent || S[i]._key).replace(/\s+/g, " ").trim(), sev: sev, code: code, arg: arg}); };
  S.forEach(function(s, i){
    DECK.seek(i, s._max, Infinity);
    // はみ出し・切れ・字の大きさ・字数：コマンド版と同じ関数（kit/core/layout-scan.mjs。app/main.js がこの仲立ちに渡す）。
    // 前からある知らせはブラウザ版の code と短い値のまま（overflowBottom・overflowRight・smallText と字数）、ほかはコマンド版の code と値
    // 本文の場所の限りはテーマの寸法（cfg.theme.metrics）から。bodyRight の限りは既定と違うときだけ値にある（kit/core/llm-fix.mjs が「1240 > 1188」から読む）
    layoutScan(s, {JA: JA, refRe: "文献|References", clip: LAYOUT_CLIP, annot: LAYOUT_ANNOT, metrics: METRICS}).forEach(function(f){
      var a = f.a, code = LEGACY[f.code];
      if (!code) return add(i, f.sev, f.code, a);
      add(i, f.sev, code, f.code === "bodyBottom" ? a.px + " > " + a.lim : f.code === "bodyRight" ? (a.lim !== undefined ? a.px + " > " + a.lim : a.px) : f.code === "smallText" ? a.px + "px「" + a.t + "」" : a.n);
    });
    if (s.querySelector(".body .katex-error")) add(i, "error", "katexError");
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
  // テーマの寸法の宣言と描いた箱（コマンド版と同じ関数。デッキに 1 回）
  try {
    var pr = metricsProbe(document, METRICS);
    if (pr.items.length) add(null, "warn", "themeMetricsDrift", {theme: TH && TH.name || "default", declared: !!(TH && TH.declared), items: pr.items});
  } catch (e) {}
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
