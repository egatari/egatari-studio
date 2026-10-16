// デッキの iframe（sandbox、origin を持たない）の中で、実行系より前に動く小さな仲立ち。編集アプリが <head> の直後に入れる
// cfg = {query, opener, dev, store, html, shim}
//   query   location.search にする文字列（"?presenter=1" など。srcdoc の文書は URL を持たないので history で付ける）
//   opener  発表者ビュー：window.opener を親（アプリが開いた窓）にする。本体とのやり取りはアプリが中継する
//   dev     server/client.js の運び手（window.__DECK_DEV_TRANSPORT）を置く。store は前の画面の位置など
//   html    発表者ビュー：中の 2 つの画面（今・次）に同じデッキを srcdoc で入れるための元の HTML。shim はこの関数の文字列
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
if (cfg.html && cfg.shim) {
  var d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src");
  Object.defineProperty(HTMLIFrameElement.prototype, "src", {configurable: true, get: d.get, set: function(v){
    var s = String(v);
    if (s.indexOf("about:srcdoc") !== 0) return d.set.call(this, v);
    var q = s.slice("about:srcdoc".length);
    var tag = "<script>(" + cfg.shim + ")(" + JSON.stringify({query: q}).replace(/</g, "\\u003c") + ");<\/script>";
    this.srcdoc = cfg.html.replace(/<head[^>]*>/i, function(m){ return m + tag; });
  }});
}
if (!cfg.dev) return;
window.__APP_LOAD = cfg.load;   // 何回目の読み込みか（確かめ方が使う）

// ---------------------------------------------------------------- 運び手（server/client.js が使う）
var seq = 0, waits = {}, listeners = [], store = cfg.store || {};
window.__DECK_DEV_TRANSPORT = {
  api: function(method, url, body){
    return new Promise(function(res){ var id = ++seq; waits[id] = res; parentWin.postMessage({type: "app-api", id: id, method: method, url: url, body: body || null}, "*"); });
  },
  listen: function(f){ listeners.push(f); },
  reload: function(){ parentWin.postMessage({type: "app-reload-now"}, "*"); },
  store: function(k, v){
    if (v === undefined) return k in store ? store[k] : null;
    if (v === null) delete store[k]; else store[k] = v;
    parentWin.postMessage({type: "app-store", k: k, v: v}, "*");
  }
};
window.addEventListener("message", function(e){
  if (e.source !== parentWin) return;
  var m = e.data || {};
  if (m.type === "app-api-reply" && waits[m.id]) { var f = waits[m.id]; delete waits[m.id]; f(m.body || {}); }
  // client.js が動いていなければ（デッキの JS が先に止まったなど）、そのまま読み込み直してもらう
  else if (m.type === "app-reload") { if (listeners.length) listeners.forEach(function(f){ f(); }); else parentWin.postMessage({type: "app-reload-now"}, "*"); }
  else if (m.type === "app-print") window.print();
  else if (m.type === "app-key") document.dispatchEvent(new KeyboardEvent("keydown", {key: m.key, bubbles: true}));
  else if (m.type === "app-go" && window.DECK) window.DECK.go(m.i, m.k, false);
  else if (m.type === "app-check") parentWin.postMessage({type: "app-check-result", id: m.id, results: quickCheck()}, "*");
});

// ---------------------------------------------------------------- 簡易な検査（kit/check.mjs の一部：はみ出し・文字の大きさ・字数・口述原稿・コントラスト）
// 部品の再現性・タイムライン・モーフ・読み上げの検査はしない（全部の検査は CLI の npm run check）
function quickCheck(){
  var DECK = window.DECK;
  if (!DECK || !DECK.slides) return [];
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
          if (e.closest("svg") || e.closest(".katex") || e.closest(".cite") || e.closest(".pn") || e.closest(".figcap")) continue;
          var f = parseFloat(getComputedStyle(e).fontSize), lim2 = e.closest("table,.plot") ? 23.9 : 26.6;
          if (f < lim2) { add(i, "error", "smallText", f + "px「" + n.textContent.trim().slice(0, 12) + "」"); break; }
        }
      }
      if (body.querySelector(".katex-error")) add(i, "error", "katexError");
    }
    // 口述原稿：static でないスライドの段階ごと
    if (!s.classList.contains("static")) {
      for (var kk = 0; kk <= s._max; kk++) {
        var full = DECK.stepKey(i, kk), sk = full.slice(s._key.length + 1);
        var turns = (DECK.NARRATION[s._key] || {})[sk] || [];
        if (!turns.length) add(i, "warn", "noNarration", sk);
      }
    }
  });
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
